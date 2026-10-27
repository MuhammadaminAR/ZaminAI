import { describe, expect, it } from "vitest";
import { buildContext, isSalinityBlocked, overallStatus, sanitizeExplanation, sourceVersion, type AssessmentRow, type Explanation } from "./context";
import type { CropResult } from "../crop-suitability/engine";
import { SOIL_RULES_VERSION } from "../crop-suitability/soil-policy";

const crop = (slug: string, rank: number, score: number | null): CropResult => ({
  slug, name: slug, nameUz: slug, score, level: score === null ? "Insufficient data" : "Moderately suitable", confidence: "Low",
  completeness: 60, factors: [{ key: "ph", label: "Soil pH", weight: 15, status: "scored", score: 0.8, detail: "", validation: "", sources: [] }],
  reasons: [], limitations: [], needsVerification: [], water: "", season: null, sources: [], rank, rankReason: "", scoreCap: null,
});
const base = (o: Partial<AssessmentRow> = {}): AssessmentRow => ({
  id: "a1", created_at: "", irrigation: "reliable", planting_month: 4, profile_version: "p2", rules_version: "r-v2", climate_status: "partial",
  climate_summary: null, preliminary: true, crops: [crop("wheat", 1, 70), crop("cotton", 2, null)], ec_e_ds_per_m: null, ec_source: null,
  salinity_risk: "standard", water_quality: null, drainage: null, reclaimed: null, ...o,
});
const raw = (): Explanation => ({
  overall: { summary: "Bug'doy 70/100 ball oldi. Ma'lumot qisman.", support: "Dastlabki.", key_limitations: [] },
  crops: [{ slug: "cotton", why_this_score: "Ma'lumot yetarli emas.", favorable: [], risks: [], missing_info: [] }, { slug: "banana", why_this_score: "x", favorable: [], risks: [], missing_info: [] }],
  water: { explanation: "w", unknowns: [] }, next_actions: [], transparency: { sources: [], predicted_vs_measured: "", missing_variables: [] },
});

describe("ai agronomy safeguards", () => {
  it("soil-only explanations exclude even present legacy weather and climate", () => {
    const a = base({ rules_version: SOIL_RULES_VERSION, climate_summary: { avg_annual_precipitation_mm: 900 } });
    const c = buildContext(a, null, { current_temperature_c: 30, current_precipitation_mm: 10, current_relative_humidity_percent: 60, fetched_at: "now", forecast: [] });
    expect(c.current_weather).toBeNull();
    expect(c.historical_climate).toEqual({ status: "excluded_soil_only", data: null });
    expect(c.irrigation_declared).toBeNull();
    expect(c.planting_month).toBeNull();
    expect(c.assessment_scope).toBe("soil_compatibility_only");
    expect(sanitizeExplanation(raw(), a).water.explanation).toContain("tahlil qilinmagan");
  });
  it("keeps stored rank order, drops crops the engine did not assess", () => {
    const s = sanitizeExplanation(raw(), base());
    expect(s.crops.map((c) => c.slug)).toEqual(["wheat", "cotton"]);
  });
  it("strips sentences quoting numeric scores", () => {
    expect(sanitizeExplanation(raw(), base()).overall.summary).toBe("Ma'lumot qisman.");
  });
  it("high-risk numeric assessment remains preliminary and recommendation-blocked", () => {
    const a = base({ salinity_risk: "high" });
    expect(isSalinityBlocked(a)).toBe(true);
    expect(overallStatus(a)).toBe("preliminary");
    const s = sanitizeExplanation(raw(), a);
    expect(s.salinity_blocked).toBe(true);
    expect(s.next_actions.some((x) => x.includes("ECe"))).toBe(true);
  });
  it("lab ECe lifts the salinity block", () => {
    expect(isSalinityBlocked(base({ salinity_risk: "high", ec_e_ds_per_m: 5 }))).toBe(false);
  });
  it("AI keeps numeric high-risk scores and stored rank unchanged but suppresses recommendations", () => {
    const a = base({ salinity_risk: "high", crops: [crop("cotton", 1, 40), crop("tomato", 2, 35)] });
    const before = JSON.stringify(a);
    const explanation = raw();
    explanation.crops = [{ slug: "tomato", why_this_score: "Tavsiya etiladi 99/100.", favorable: ["Ekish yaxshi."], risks: [], missing_info: [] }];
    const s = sanitizeExplanation(explanation, a);
    expect(s.crops.map((c) => c.slug)).toEqual(["cotton", "tomato"]);
    expect(s.crops.every((c) => c.favorable.length === 0)).toBe(true);
    expect(buildContext(a, null, null).crops.map((c) => c.score)).toEqual([40, 35]);
    expect(JSON.stringify(a)).toBe(before);
  });
  it("missing soil stays null in the AI context", () => {
    expect(buildContext(base(), null, null).soil).toBeNull();
    expect(buildContext(base(), null, null).salinity.lab_ece_ds_per_m).toBeNull();
  });
  it("version changes when the assessment changes", () => {
    expect(sourceVersion(base())).not.toBe(sourceVersion(base({ id: "a2" })));
    expect(sourceVersion(base())).not.toBe(sourceVersion(base({ crops: [crop("wheat", 1, 71)] })));
    expect(sourceVersion(base())).toBe(sourceVersion(base()));
  });
  it("AI receives saved unavailable calendar evidence, never a substituted zone", () => {
    const c = crop("tomato", 1, 60);
    c.factors.push({ key: "calendar", label: "Local planting calendar", weight: 10, status: "unavailable", score: null,
      detail: "District missing", validation: "unverified", sources: [], zoneResolution: {
        version: "uz-fao-zone-mapping-v1", status: "unavailable", zoneId: null, canonicalUnit: null,
        regionCode: null, candidateZones: [], reason: "District missing", evidence: null, sources: [] } });
    const f = buildContext(base({ crops: [c] }), null, null).crops[0]?.factors.find((f) => f.factor === "Local planting calendar");
    expect(f?.score_0_100).toBeNull();
    expect(f?.zone_resolution?.status).toBe("unavailable");
    expect(f?.zone_resolution?.zoneId).toBeNull();
  });
});
