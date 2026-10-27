import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { soilgridsAnalysis } from "@/lib/soilgrids.functions";
import { AppShell } from "@/components/app-shell";
import { CropRecommendationCard } from "@/components/crop-card";
import { MapContainer } from "@/components/map-container";
import { MetricCard } from "@/components/metric-card";
import { CropSuitabilitySection } from "@/components/crop-suitability-section";
import type { CropResult } from "@/lib/crop-suitability/engine";
import { SOIL_RULES_VERSION } from "@/lib/crop-suitability/soil-policy";
import { AnalysisStatusBadge } from "@/components/status-badge";
import { DemoBadge, ErrorState, LoadingState } from "@/components/ui-states";
import { getAnalysis, saveSoil } from "@/lib/store";
import { localizeError, useLanguage } from "@/lib/i18n";
import type { Analysis, SoilEstimate } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/results/$id")({
  head: () => ({
    meta: [
      { title: "Analysis results — ZaminAI" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content: "SoilGrids estimates and preliminary soil-based crop compatibility for your selected location.",
      },
      { property: "og:title", content: "Analysis results — ZaminAI" },
      { property: "og:description", content: "Soil estimates and preliminary soil-based suitability." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResultsPage,
});

function ResultsPage() {
  const { id } = Route.useParams();
  const { t, fmtDateTime } = useLanguage();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [best, setBest] = useState<CropResult | null>(null);

  const reload = useCallback(() => {
    return getAnalysis(id)
      .then((a) => setAnalysis(a))
      .catch(() => setAnalysis(null))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return (
      <AppShell>
        <LoadingState label={t("res.loading")} />
      </AppShell>
    );
  }

  if (!analysis) {
    return (
      <AppShell>
        <ErrorState
          title={t("res.notFoundTitle")}
          message={t("res.notFoundText")}
          action={
            <Link
              to="/analyze"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {t("nav.analyzeCta")}
            </Link>
          }
        />
      </AppShell>
    );
  }

  const { soil, location } = analysis;
  const isReal = analysis.soilSource === "soilgrids" || !!analysis.realWeather || analysis.soilStatus === "error";

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">{analysis.farmName}</h1>
            <AnalysisStatusBadge status={analysis.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {location.region} · {location.lat.toFixed(5)}, {location.lng.toFixed(5)} ·{" "}
            {fmtDateTime(analysis.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isReal ? null : <DemoBadge />}
          <Link
            to="/analyze"
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            {t("res.newAnalysis")}
          </Link>
        </div>
      </div>

      <section className="mt-6 card-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("res.selectedLocation")}</h2>
        {location.locationStatus === "resolved" ? (
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="inline text-muted-foreground">{t("res.country")}: </dt><dd className="inline font-medium text-foreground">{location.country ?? t("res.unknown")}</dd></div>
            <div><dt className="inline text-muted-foreground">{t("res.region")}: </dt><dd className="inline font-medium text-foreground">{location.region}</dd></div>
            <div><dt className="inline text-muted-foreground">{t("res.district")}: </dt><dd className="inline font-medium text-foreground">{location.district ?? location.locality ?? t("res.notAvailable")}</dd></div>
            <div><dt className="inline text-muted-foreground">{t("res.coordinates")}: </dt><dd className="inline font-mono font-medium text-foreground">{location.lat.toFixed(6)}, {location.lng.toFixed(6)}</dd></div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("res.locationReview")}{" "}
            {t("res.coordinates")}: <span className="font-mono text-foreground">{location.lat.toFixed(6)}, {location.lng.toFixed(6)}</span>
          </p>
        )}
        {location.locationStatus === "resolved" && location.countryCode !== "UZ" ? (
          <p className="mt-2 text-xs text-destructive">{t("res.outsideUz")}</p>
        ) : null}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <MapContainer selected={location} interactive={false} height={280} />
        {isReal ? (
          <div className="card-surface flex flex-col justify-center p-6">
            <p className="text-sm text-muted-foreground">{t("res.soilSuitability")}</p>
            {best ? (
              <>
                <p className="mt-1 text-2xl font-semibold text-foreground">{t(`crop.${best.slug}`)} · {best.score}/100</p>
                <p className="mt-2 text-sm text-muted-foreground">{t(`level.${best.level}`)} · {t("res.confidence")} {t(`confidence.${best.confidence}`)}. {best.diagnostics?.rulesVersion === SOIL_RULES_VERSION ? t("res.soilOnlyNote") : t("res.legacyNote")} {t("res.notPlanting")}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{t("res.compareBelow")}</p>
            )}
          </div>
        ) : (
        <div className="card-surface flex flex-col justify-center p-6">
          <p className="text-sm text-muted-foreground">{t("res.overallSuitability")}</p>
          <p className="mt-1 text-4xl font-semibold text-foreground">
            {analysis.suitabilityScore}
            <span className="text-lg font-normal text-muted-foreground">/100</span>
          </p>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${analysis.suitabilityScore}%` }}
            />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{t("res.demoScoreText")}</p>
        </div>
        )}
      </div>

      {analysis.soilStatus === "error" && !analysis.soilEstimate ? (
        <SoilRetry analysis={analysis} onDone={reload} />
      ) : analysis.soilSource === "soilgrids" && analysis.soilEstimate ? (
        <SoilGridsSection est={analysis.soilEstimate} lat={location.lat} lng={location.lng} />
      ) : (
        <>
      <section className="mt-10">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">{t("res.soilOverview")}</h2>
          <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-foreground">
            {t("res.demoSoil")}
          </span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label={t("res.ph")}
            value={soil.ph}
            hint={soil.ph < 6 ? t("res.phAcidic") : soil.ph > 7.5 ? t("res.phAlkaline") : t("res.phNeutral")}
            progress={((soil.ph - 4) / 6) * 100}
          />
          <MetricCard
            label={t("res.nitrogen")}
            value={soil.nitrogenPct}
            unit="%"
            hint={soil.nitrogenPct < 0.12 ? t("res.nitrogenLow") : t("res.nitrogenOk")}
            progress={(soil.nitrogenPct / 0.3) * 100}
          />
          <MetricCard
            label={t("res.organicCarbon")}
            value={soil.organicCarbonPct}
            unit="%"
            hint={t("res.ocHint")}
            progress={(soil.organicCarbonPct / 3.5) * 100}
          />
          <MetricCard label={t("res.clay")} value={soil.clayPct} unit="%" progress={soil.clayPct} />
          <MetricCard label={t("res.sand")} value={soil.sandPct} unit="%" progress={soil.sandPct} />
          <MetricCard label={t("res.silt")} value={soil.siltPct} unit="%" progress={soil.siltPct} />
        </div>
      </section>

        </>
      )}

      {isReal ? (
        <CropSuitabilitySection analysisId={analysis.id} lat={location.lat} lng={location.lng}
          hasRealSoil={analysis.soilSource === "soilgrids"} riskOverride={location.salinityRiskOverride ?? null} onScore={setBest} />
      ) : (
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{t("res.cropRecs")}</h2>
          <span className="text-xs text-muted-foreground">{t("res.rankedBy")}</span>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {analysis.recommendations.map((rec) => (
            <CropRecommendationCard key={rec.cropId} rec={rec} />
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{t("res.demoProfiles")}</p>
      </section>
      )}
    </AppShell>
  );
}

function SoilGridsSection({ est, lat, lng }: { est: SoilEstimate; lat: number; lng: number }) {
  const { t } = useLanguage();
  const rows: { label: string; value: number | null; unit?: string }[] = [
    { label: t("res.ph"), value: est.ph },
    { label: t("res.totalNitrogen"), value: est.nitrogenGPerKg, unit: "g/kg" },
    { label: t("res.clay"), value: est.clayPct, unit: "%" },
    { label: t("res.sand"), value: est.sandPct, unit: "%" },
    { label: t("res.silt"), value: est.siltPct, unit: "%" },
    { label: t("res.organicCarbon"), value: est.organicCarbonGPerKg, unit: "g/kg" },
    { label: t("res.cec"), value: est.cecCmolPerKg, unit: "cmol(c)/kg" },
  ];
  const allMissing = rows.every((r) => r.value === null);
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground">{t("res.soilProps")}</h2>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="inline">{t("res.source")}: </dt><dd className="inline font-medium text-foreground">ISRIC SoilGrids 2.0</dd></div>
        <div><dt className="inline">{t("res.depth")}: </dt><dd className="inline font-medium text-foreground">0-5 cm</dd></div>
        <div><dt className="inline">{t("res.prediction")}: </dt><dd className="inline font-medium text-foreground">Q0.5 (median)</dd></div>
        <div><dt className="inline">{t("res.coordinates")}: </dt><dd className="inline font-medium text-foreground">{lat.toFixed(5)}, {lng.toFixed(5)}</dd></div>
      </dl>
      {allMissing ? (
        <p className="mt-4 rounded-lg border border-border bg-muted p-4 text-sm text-foreground">
          {t("res.noSoilData")}
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r) => (
            <div key={r.label} className="card-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{r.label}</p>
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary">{t("res.estimated")}</span>
              </div>
              {r.value === null ? (
                <p className="mt-2 text-sm text-muted-foreground">{t("res.noData")}</p>
              ) : (
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {r.value}
                  {r.unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{r.unit}</span> : null}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t("res.soilgridsNote")}</p>
    </section>
  );
}

function RetryBox({ title, message, button, onRetry, disabledUntil }: { title: string; message: string; button: string; onRetry: () => Promise<void>; disabledUntil?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, tick] = useState(0);
  const { t } = useLanguage();
  const blocked = !!disabledUntil && new Date(disabledUntil).getTime() > Date.now();
  useEffect(() => {
    if (!blocked || !disabledUntil) return;
    const tm = setTimeout(() => tick((n) => n + 1), Math.min(new Date(disabledUntil).getTime() - Date.now() + 500, 2 ** 31 - 1));
    return () => clearTimeout(tm);
  }, [blocked, disabledUntil]);
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-3 rounded-lg border border-border bg-muted p-4 text-sm text-foreground">
        <p>{message}</p>
        {err ? <p className="mt-2 text-xs text-destructive">{err}</p> : null}
        <button
          type="button"
          disabled={busy || blocked}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await onRetry();
            } catch (e) {
              setErr(localizeError((e as Error).message || "retry", t) || t("res.retryFailed"));
            } finally {
              setBusy(false);
            }
          }}
          className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:bg-muted-foreground"
        >
          {busy ? t("res.retrying") : button}
        </button>
        {blocked ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("res.retryAfter", { time: new Date(disabledUntil ?? "").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}</p>
        ) : null}
      </div>
    </section>
  );
}

function SoilRetry({ analysis, onDone }: { analysis: Analysis; onDone: () => Promise<void> }) {
  const run = useServerFn(soilgridsAnalysis);
  const { t } = useLanguage();
  const { lat, lng } = analysis.location;
  return (
    <RetryBox
      title={t("res.soilRetryTitle")}
      message={t("res.soilRetryText")}
      button={t("res.soilRetryButton")}
      onRetry={async () => {
        const res = await run({ data: { latitude: lat, longitude: lng } });
        const s = res.soil;
        const allNoData = Object.values(res.errors).every((e) => e?.startsWith("No data"));
        if (!res.success && !allNoData) throw new Error(t("res.soilStillDown"));
        if (!analysis.farmId) throw new Error(t("res.farmNotFound"));
        await saveSoil(analysis.id, analysis.farmId, lat, lng, {
          ph: s.ph, nitrogenGPerKg: s.nitrogen_g_per_kg, clayPct: s.clay_percent, sandPct: s.sand_percent,
          siltPct: s.silt_percent, organicCarbonGPerKg: s.organic_carbon_g_per_kg, cecCmolPerKg: s.cec_cmol_per_kg,
        }, res.success ? "success" : "no_data");
        await onDone();
      }}
    />
  );
}
