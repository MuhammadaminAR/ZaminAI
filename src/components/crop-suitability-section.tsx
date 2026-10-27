import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { cropSuitabilityAnalysis } from "@/lib/crop-suitability.functions";
import { getLatestAssessment } from "@/lib/store";
import type { CropResult } from "@/lib/crop-suitability/engine";
import { SOIL_RULES_VERSION as RULES_VERSION, SOIL_POLICY, SOIL_SCORE_BANDS } from "@/lib/crop-suitability/soil-policy";
import { SOURCES } from "@/lib/crop-suitability/profiles";
import { isExposedAralSeabed, SEABED_ZONE_SOURCE } from "@/lib/crop-suitability/aral-seabed";
import { AiAgronomySection } from "@/components/ai-agronomy-section";
import type { AssessmentRow } from "@/lib/ai-agronomy/context";
import { Button } from "@/components/ui/button";
import { localizeError, useLanguage } from "@/lib/i18n";

interface Saved {
  id: string;
  created_at: string;
  irrigation: string;
  planting_month: number | null;
  profile_version: string;
  rules_version: string;
  climate_status: string;
  preliminary: boolean;
  crops: CropResult[];
  ec_e_ds_per_m: number | null;
  salinity_risk: string | null;
  water_quality: string | null;
  drainage: string | null;
  reclaimed: string | null;
}

const OPT3 = ["yes", "no", "unknown"] as const;
const WATER_Q = ["fresh", "saline", "unknown"] as const;

export function CropSuitabilitySection({ analysisId, lat, lng, hasRealSoil, riskOverride, onScore }: {
  analysisId: string; lat: number; lng: number; hasRealSoil: boolean; riskOverride?: "high" | "standard" | null; onScore?: (best: CropResult | null) => void;
}) {
  const run = useServerFn(cropSuitabilityAnalysis);
  const { t } = useLanguage();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ece, setEce] = useState("");
  const [waterQuality, setWaterQuality] = useState("unknown");
  const [drainage, setDrainage] = useState("unknown");
  const [reclaimed, setReclaimed] = useState("unknown");
  const highRisk = riskOverride === "high" || (riskOverride !== "standard" && isExposedAralSeabed(lat, lng));

  useEffect(() => {
    getLatestAssessment(analysisId)
      .then((d) => { if (d) {
        setSaved(d as unknown as Saved);
        setEce(d.ec_e_ds_per_m === null ? "" : String(d.ec_e_ds_per_m));
        setWaterQuality(d.water_quality ?? "unknown");
        setDrainage(d.drainage ?? "unknown");
        setReclaimed(d.reclaimed ?? "unknown");
      } })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [analysisId]);
  useEffect(() => { onScore?.(saved?.crops.find((c) => c.score !== null) ?? null); }, [saved, onScore]);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const eceVal = ece.trim() === "" ? null : Number(ece);
      if (eceVal !== null && (!Number.isFinite(eceVal) || eceVal < 0.05 || eceVal > 60)) {
        setErr(t("crops.eceInvalid"));
        setBusy(false);
        return;
      }
      await run({ data: { analysisId, latitude: lat, longitude: lng, irrigation: "unknown", plantingMonth: null, salinityEce: eceVal, waterQuality, drainage, reclaimed } });
      const d = await getLatestAssessment(analysisId);
      if (d) setSaved(d as unknown as Saved);
    } catch (e) {
      setErr(e instanceof Error ? localizeError(e.message, t) : t("crops.assessFailed"));
    } finally { setBusy(false); }
  };

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{t("crops.title")}</h2>
        <span className="text-xs text-muted-foreground">{t("crops.subtitle")}</span>
      </div>

      <div className="mt-4 card-surface p-5">
        <p className="text-sm text-foreground">{t("crops.soilOnly")}</p>
        {!hasRealSoil ? <p className="mt-2 text-xs text-muted-foreground">{t("crops.noRealSoil")}</p> : null}
        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <p className="text-sm font-medium text-foreground">{t("crops.salinityTitle")}</p>
          {highRisk ? (
            <p className="mt-1 text-xs text-destructive">{t("crops.salinityHighRisk")}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{t("crops.salinityUnknown")}</p>
          )}
          <label className="mt-3 block text-sm">
            <span className="text-muted-foreground">{t("crops.eceLabel")}</span>
            <input type="number" inputMode="decimal" min="0.05" max="60" step="0.1" value={ece} onChange={(e) => setEce(e.target.value)}
              placeholder={t("crops.ecePlaceholder")}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
          </label>
          {highRisk ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                <span className="text-muted-foreground">{t("crops.waterQuality")}</span>
                <select value={waterQuality} onChange={(e) => setWaterQuality(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground">
                  {WATER_Q.map((o) => <option key={o} value={o}>{t(`crops.water${o === "fresh" ? "Fresh" : o === "saline" ? "Saline" : "Unknown"}`)}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground">{t("crops.drainage")}</span>
                <select value={drainage} onChange={(e) => setDrainage(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground">
                  {OPT3.map((o) => <option key={o} value={o}>{t(`crops.${o}`)}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground">{t("crops.reclaimed")}</span>
                <select value={reclaimed} onChange={(e) => setReclaimed(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground">
                  {OPT3.map((o) => <option key={o} value={o}>{t(`crops.${o}`)}</option>)}
                </select>
              </label>
              <p className="text-xs text-muted-foreground sm:col-span-3">{t("crops.answersNote")}</p>
            </div>
          ) : null}
        </div>
        {err ? <p className="mt-2 text-sm text-destructive">{err}</p> : null}
        <Button type="button" onClick={submit} disabled={busy || !hasRealSoil}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {busy ? t("crops.assessing") : saved ? t("crops.reassess") : t("crops.assess")}
        </Button>
      </div>

      {loading ? null : saved ? <Results s={saved} /> : null}
      {!loading && saved ? <AiAgronomySection analysisId={analysisId} assessment={saved as unknown as AssessmentRow} /> : null}
    </section>
  );
}

function Results({ s }: { s: Saved }) {
  const { t, fmtDateTime } = useLanguage();
  const highRisk = s.salinity_risk === "high";
  const salinityAssessed = s.ec_e_ds_per_m !== null && s.ec_e_ds_per_m !== undefined;
  const legacy = s.rules_version !== RULES_VERSION;
  const optLabel = (v: string | null) => t(`crops.${v ?? "unknown"}`);
  return (
    <div className="mt-6">
      <p className="text-xs text-muted-foreground">
        {t("crops.assessedAt", { date: fmtDateTime(s.created_at), profile: s.profile_version, rules: s.rules_version })}
        {s.preliminary ? ` · ${t("crops.preliminary")}` : ""}
      </p>
      {legacy ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          {t("crops.legacyTitle")}
        </div>
      ) : null}
      {highRisk && !salinityAssessed ? (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">{t("crops.salinityNotVerified")}</p>
          <p className="mt-1 text-sm text-foreground">{t("crops.salinityHighText")}</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
            <li>{t("crops.salinityNeed1")}</li>
            <li>{t("crops.salinityNeed2")}</li>
            <li>{t("crops.salinityNeed3")}</li>
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("crops.recordedAnswers", { water: optLabel(s.water_quality), drainage: optLabel(s.drainage), reclaimed: optLabel(s.reclaimed) })}{" "}
            {t("crops.classification", { source: SEABED_ZONE_SOURCE })}
          </p>
        </div>
      ) : !salinityAssessed ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t("crops.salinityNotVerified")}.</span> {t("crops.salinityUnverifiedText")}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t("crops.salinityAssessed")}</span> {t("crops.salinityAssessedText", { ece: s.ec_e_ds_per_m ?? "" })}
        </div>
      )}
      <ol className="mt-4 grid gap-4 lg:grid-cols-2">
        {s.crops.map((c) => <CropCard key={c.slug} c={c} legacy={legacy} />)}
      </ol>
      <div className="mt-6 card-surface p-5 text-xs text-muted-foreground space-y-2">
        <p><span className="font-medium text-foreground">{t("crops.howTitle")}</span> {legacy ? t("crops.legacyTitle") + " " : ""}{t("crops.howFormula", { phWeight: SOIL_POLICY.phWeight, textureWeight: SOIL_POLICY.textureWeight })}</p>
        <p>{t("crops.howRange")}</p>
        <p><span className="font-medium text-foreground">{t("crops.howSalinity", { cap: SOIL_POLICY.highSalinityWithoutLabCap })}</span></p>
        <p><span className="font-medium text-foreground">{t("crops.howBands", { strong: SOIL_SCORE_BANDS.strong, reasonable: SOIL_SCORE_BANDS.reasonable, mixed: SOIL_SCORE_BANDS.mixed, strongMax: SOIL_SCORE_BANDS.strong - 1, reasonableMax: SOIL_SCORE_BANDS.reasonable - 1 })}</span></p>
        <p>{t("crops.howDisclaimer")}</p>
      </div>
    </div>
  );
}

function CropCard({ c, legacy }: { c: CropResult; legacy: boolean }) {
  const { t } = useLanguage();
  return (
    <li className="card-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">#{c.rank}</p>
          <h3 className="text-base font-semibold text-foreground">{t(`crop.${c.slug}`)}{c.nameUz !== t(`crop.${c.slug}`) ? <span className="font-normal text-muted-foreground"> · {c.nameUz}</span> : null}</h3>
          <p className="text-sm text-foreground">{t(`level.${c.level}`)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{legacy ? t("crops.historicalScore") : t("crops.preliminaryScore")}</p>
          <p className="text-2xl font-semibold text-foreground">{c.score ?? "—"}{c.score !== null ? <span className="text-sm font-normal text-muted-foreground">/100</span> : null}</p>
          <p className="text-xs text-muted-foreground">{t("crops.confidenceData", { confidence: t(`confidence.${c.confidence}`), completeness: c.completeness })}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{c.rankReason}</p>
      {c.diagnostics?.riskCaps.length ? <List title={t("crops.appliedCaps")} items={c.diagnostics.riskCaps.map((r) => t("crops.capMax", { cap: r.cap, reason: r.reason }))} /> : null}
      {c.reasons.length ? <List title={t("crops.whyFits")} items={c.reasons} /> : null}
      {c.limitations.length ? <List title={t("crops.risksLimits")} items={c.limitations} /> : null}
      {!legacy ? <><List title={t("crops.availableFactors")} items={c.factors.filter((f) => f.status === "scored").map((f) => f.label)} /><List title={t("crops.missingFactors")} items={c.factors.filter((f) => f.status === "unavailable").map((f) => `${f.label}: ${f.detail}`)} /><p className="mt-3 text-xs text-muted-foreground">{t("crops.climateExcluded")}</p></> : null}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-foreground">{t("crops.detailsSummary")}</summary>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          {c.factors.map((f) => (
            <li key={f.key}><span className="text-foreground">{f.label} ({f.weight}%):</span> {f.status === "scored" && f.score !== null ? `${Math.round(f.score * 100)}/100` : t("crops.notScored")} — {f.detail}{f.validation === "interpretation" ? ` ${t("crops.interpretation")}` : ""}</li>
          ))}
        </ul>
        {c.diagnostics ? <p className="mt-2 text-muted-foreground">{t("crops.weightedAvg", { base: c.diagnostics.baseScore === null ? t("crops.unavailable") : c.diagnostics.baseScore.toFixed(1), final: c.score ?? t("crops.unavailable") })}</p> : null}
        <List title={t("crops.needsVerification")} items={c.needsVerification} />
        <ul className="mt-2 space-y-1">
          {c.sources.map((id) => SOURCES[id]).filter((x): x is NonNullable<typeof x> => !!x).map((src) => (
            <li key={src.id}><a href={src.url} target="_blank" rel="noreferrer" className="text-primary underline">{src.title}</a></li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-foreground">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}
