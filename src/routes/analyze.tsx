import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import type { LatLng } from "@/components/map-types";
import { useSession } from "@/hooks/use-session";
import { isSupported, reverseGeocode, searchPlaces, type GeoLocation, type GeoResult } from "@/lib/geocode";
import { createAnalysis } from "@/lib/store";
import { soilgridsAnalysis } from "@/lib/soilgrids.functions";
import { cropSuitabilityAnalysis } from "@/lib/crop-suitability.functions";
import { QuotaStatusCard } from "@/components/quota-status";
import { canStartAnalysis } from "@/lib/quota";
import {
  finalizeAnalysisQuota,
  releaseAnalysisQuota,
  reserveAnalysisQuota,
  type QuotaStatus,
} from "@/lib/quota.functions";
import { useServerFn } from "@tanstack/react-start";
import type { SoilEstimate } from "@/lib/types";
import { useNavigate } from "@tanstack/react-router";
import { localizeError, useLanguage } from "@/lib/i18n";

const MapboxMap = lazy(() => import("@/components/mapbox-map"));

export const Route = createFileRoute("/analyze")({
  head: () => ({
    meta: [
      { title: "Analyze my land — ZaminAI" },
      {
        name: "description",
        content: "Find your field on an interactive map of Uzbekistan and select it for land analysis.",
      },
      { property: "og:title", content: "Analyze my land — ZaminAI" },
      { property: "og:description", content: "Select your field on the map for land analysis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyzePage,
});

function AnalyzePage() {
  const { user } = useSession();
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [point, setPoint] = useState<LatLng | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ point: LatLng; zoom: number; key: number } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [geoSupported, setGeoSupported] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [noData, setNoData] = useState(false);
  const [canFallback, setCanFallback] = useState(false);
  const runSoilGrids = useServerFn(soilgridsAnalysis);
  const runCrops = useServerFn(cropSuitabilityAnalysis);
  const reserveQuota = useServerFn(reserveAnalysisQuota);
  const finalizeQuota = useServerFn(finalizeAnalysisQuota);
  const releaseQuota = useServerFn(releaseAnalysisQuota);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [geo, setGeo] = useState<GeoLocation | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "error">("idle");
  const geoReq = useRef(0);

  async function resolveLocation(p: LatLng) {
    const req = ++geoReq.current;
    setGeo(null);
    setGeoStatus("loading");
    try {
      const g = await reverseGeocode({ latitude: p.lat, longitude: p.lng });
      if (req !== geoReq.current) return;
      setGeo(g);
      setGeoStatus("idle");
    } catch {
      if (req !== geoReq.current) return;
      setGeoStatus("error");
    }
  }
  const navigate = useNavigate();

  useEffect(() => {
    setMounted(true);
    setGeoSupported("geolocation" in navigator);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q === label) {
      setResults([]);
      return;
    }
    const tm = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        setResults(await searchPlaces(q));
      } catch {
        setSearchError(t("analyze.searchError"));
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => window.clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, label]);

  function choose(p: LatLng, name: string | null, zoom?: number) {
    setPoint(p);
    setLabel(name);
    setSaved(false);
    setAnalyzeError(null);
    setNoData(false);
    setCanFallback(false);
    void resolveLocation(p);
    if (zoom) setFlyTo({ point: p, zoom, key: Date.now() });
  }

  function useMyLocation() {
    setGeoMsg(t("analyze.geoRequesting"));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoMsg(null);
        choose({ lat: pos.coords.latitude, lng: pos.coords.longitude }, t("analyze.myLocation"), 14);
      },
      () => setGeoMsg(t("analyze.geoDenied")),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  type SoilOutcome = { status: "success" | "no_data"; est: SoilEstimate } | { status: "error"; msg: string };

  /** Saves the analysis and returns its ID; the caller decides when to navigate. */
  async function save(soilStatus: "success" | "no_data" | "error" | "demo", soilEstimate?: SoilEstimate): Promise<string> {
    if (!point || !user || !geo) throw new Error("No location selected.");
    const id = await createAnalysis({
      geo,
      userId: user.id,
      farmName: (label ?? `Field ${point.lat.toFixed(3)}, ${point.lng.toFixed(3)}`).slice(0, 120),
      lat: point.lat,
      lng: point.lng,
      soilStatus,
      soilEstimate,
      weather: null,
    });
    return id;
  }

  async function fetchSoil(lat: number, lng: number): Promise<SoilOutcome> {
    try {
      const res = await runSoilGrids({ data: { latitude: lat, longitude: lng } });
      const s = res.soil;
      const est: SoilEstimate = {
        ph: s.ph,
        nitrogenGPerKg: s.nitrogen_g_per_kg,
        clayPct: s.clay_percent,
        sandPct: s.sand_percent,
        siltPct: s.silt_percent,
        organicCarbonGPerKg: s.organic_carbon_g_per_kg,
        cecCmolPerKg: s.cec_cmol_per_kg,
      };
      if (res.success) return { status: "success", est };
      const allNoData = Object.values(res.errors).every((e) => e?.startsWith("No data"));
      return allNoData
        ? { status: "no_data", est }
        : { status: "error", msg: t("analyze.soilDown") };
    } catch (err) {
      const msg = (err as Error).message ?? "";
      return { status: "error", msg: msg.includes("Too many") ? localizeError(msg, t) : t("analyze.soilUnreachable") };
    }
  }

  async function analyze() {
    if (!point || saved) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    // Location safety: geography must be resolved for exactly this point and be supported.
    if (!geo || geo.latitude !== point.lat || geo.longitude !== point.lng || !isSupported(geo)) return;
    // Server-side quota gate: reserve one unit before any provider work. The
    // database rejects atomically when the allowance is exhausted or cooling down.
    let reservationId: string;
    try {
      reservationId = await reserveQuota();
    } catch (err) {
      setAnalyzeError(localizeError((err as Error).message, t));
      return;
    }
    setSaved(true);
    setAnalyzeError(null);
    setNoData(false);
    setCanFallback(false);
    const soil = await fetchSoil(point.lat, point.lng);
    if (soil.status === "error") {
      // Complete provider failure: no usable real result, so the unit is returned.
      await releaseQuota({ data: { reservationId } }).catch(() => {});
      setSaved(false);
      setCanFallback(true);
      setAnalyzeError(`${soil.msg} ${t("analyze.tryAgain")}`);
      return;
    }
    try {
      const analysisId = await save(soil.status, soil.est);
      // A real (possibly partial) result was saved: finalize exactly one unit.
      await finalizeQuota({ data: { reservationId, analysisId } });
      await runCrops({ data: { analysisId, latitude: point.lat, longitude: point.lng, irrigation: "unknown", plantingMonth: null } }).catch(() => undefined);
      navigate({ to: "/results/$id", params: { id: analysisId } });
    } catch (err) {
      await releaseQuota({ data: { reservationId } }).catch(() => {});
      setSaved(false);
      setAnalyzeError(localizeError((err as Error).message, t));
    }
  }

  // Demo-soil fallback is explicitly not a real analysis: it never touches the quota.
  async function useDemoFallback() {
    setSaved(true);
    setAnalyzeError(null);
    try {
      const id = await save("demo");
      navigate({ to: "/results/$id", params: { id } });
    } catch (err) {
      setSaved(false);
      setAnalyzeError(localizeError((err as Error).message, t));
    }
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold text-foreground">{t("analyze.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("analyze.sub")}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="relative h-[60vh] min-h-[420px] overflow-hidden rounded-xl border border-border bg-muted lg:h-[640px]">
          {mounted ? (
            <Suspense fallback={null}>
              <MapboxMap selected={point} flyTo={flyTo} onSelect={(p) => choose(p, null)} />
            </Suspense>
          ) : null}

          <div className="absolute left-3 top-3 z-10 w-[calc(100%-4.5rem)] max-w-md">
            <div className="flex gap-2">
              <input
                value={query}
                maxLength={120}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("analyze.searchPlaceholder")}
                aria-label={t("analyze.searchLabel")}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none focus:border-primary"
              />
              {geoSupported ? (
                <button
                  type="button"
                  onClick={useMyLocation}
                  className="shrink-0 rounded-lg border border-input bg-card px-3 py-2 text-xs font-medium text-foreground shadow-sm hover:bg-accent"
                >
                  {t("analyze.useMyLocation")}
                </button>
              ) : null}
            </div>
            {searching || searchError || results.length > 0 ? (
              <ul className="mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-card shadow-md">
                {searching ? <li className="px-3 py-2 text-xs text-muted-foreground">{t("analyze.searching")}</li> : null}
                {searchError ? <li className="px-3 py-2 text-xs text-destructive">{searchError}</li> : null}
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        choose({ lat: r.lat, lng: r.lng }, r.name, 12);
                        setResults([]);
                        setQuery(r.name);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                    >
                      {r.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {geoMsg ? (
              <p className="mt-1 rounded bg-card/95 px-2 py-1 text-xs text-muted-foreground">{geoMsg}</p>
            ) : null}
          </div>
        </div>

        <aside className="card-surface h-fit p-6">
          <h2 className="text-base font-semibold text-foreground">{t("analyze.selectedLocation")}</h2>
          {point ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">{t("analyze.latitude")}</p>
                <p className="font-mono text-sm font-semibold text-foreground">{point.lat.toFixed(6)}</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">{t("analyze.longitude")}</p>
                <p className="font-mono text-sm font-semibold text-foreground">{point.lng.toFixed(6)}</p>
              </div>
              {geoStatus === "loading" ? (
                <p className="text-sm text-muted-foreground">{t("analyze.identifying")}</p>
              ) : geoStatus === "error" ? (
                <div className="rounded-lg border border-border bg-muted p-3 text-xs text-foreground">
                  <p>{t("analyze.geoFailed")}</p>
                  <button
                    type="button"
                    onClick={() => void resolveLocation(point)}
                    className="mt-2 font-medium text-primary hover:underline"
                  >
                    {t("ui.retry")}
                  </button>
                </div>
              ) : geo ? (
                <dl className="space-y-1 text-sm">
                  <div><dt className="inline text-muted-foreground">{t("analyze.country")}: </dt><dd className="inline font-medium text-foreground">{geo.country ?? t("analyze.unknown")}</dd></div>
                  {isSupported(geo) ? (
                    <>
                      <div><dt className="inline text-muted-foreground">{t("analyze.region")}: </dt><dd className="inline font-medium text-foreground">{geo.region ?? t("analyze.notAvailable")}</dd></div>
                      <div><dt className="inline text-muted-foreground">{t("analyze.district")}: </dt><dd className="inline font-medium text-foreground">{geo.district ?? geo.locality ?? t("analyze.notAvailable")}</dd></div>
                    </>
                  ) : (
                    <div className="mt-2 rounded-lg border border-border bg-muted p-3 text-xs">
                      <p className="font-medium text-foreground">{t("analyze.outsideTitle")}</p>
                      <p className="mt-1 text-muted-foreground">{t("analyze.outsideText")}</p>
                    </div>
                  )}
                </dl>
              ) : null}
              <p className="text-sm">
                <span className="text-muted-foreground">{t("analyze.status")}: </span>
                <span className="font-medium text-foreground">
                  {saved ? t("analyze.fetchingSoil") : t("analyze.locationSelected")}
                </span>
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                {t("analyze.selectPrompt")}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">{t("analyze.status")}: </span>
                <span className="font-medium text-foreground">{t("analyze.noLocation")}</span>
              </p>
            </div>
          )}

          {user ? (
            <div className="mt-6">
              <QuotaStatusCard onChange={setQuota} />
            </div>
          ) : null}
          <button
            type="button"
            disabled={!point || saved || !geo || !isSupported(geo) || geo.latitude !== point.lat || geo.longitude !== point.lng || (!!quota && !canStartAnalysis(quota))}
            onClick={analyze}
            className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {saved ? t("analyze.analyzing") : analyzeError ? t("analyze.retryAnalysis") : user ? t("analyze.analyzeThis") : t("analyze.loginToAnalyze")}
          </button>
          {noData ? (
            <div className="mt-3 rounded-lg border border-border bg-muted p-3 text-xs text-foreground">
              <p className="font-medium">{t("analyze.noDataTitle")}</p>
              <p className="mt-1 text-muted-foreground">{t("analyze.noDataText")}</p>
            </div>
          ) : null}
          {analyzeError ? <p className="mt-3 text-xs text-destructive">{analyzeError}</p> : null}
          {canFallback && !saved ? (
            <button
              type="button"
              onClick={useDemoFallback}
              className="mt-2 w-full rounded-lg border border-border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-accent"
            >
              {t("analyze.demoFallback")}
            </button>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">{t("analyze.soilOnly")}</p>
        </aside>
      </div>
    </AppShell>
  );
}
