import { afterEach, describe, expect, it, vi } from "vitest";
import { assessCrops, type EngineInput } from "./engine";
import { uncertaintyScore } from "./fallback-policy";
import { CROP_PROFILES } from "./profiles";
import { aggregate, type DailySeries } from "../historical-weather.server";
import { validatedSavedClimate } from "../prepared-climate";

afterEach(() => vi.unstubAllGlobals());

const input = (extra: Partial<EngineInput> = {}): EngineInput => ({
  soil: { ph: 6.5, sandPct: 40, siltPct: 40, clayPct: 20 },
  climate: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, temperatureMeanC: 20, precipitationMm: 200 })),
  irrigation: "reliable", plantingMonth: 4, salinityEce: null, salinityRisk: "standard",
  location: { countryCode: "UZ", latitude: 41, longitude: 69, region: "Tashkent region", district: null,
    source: "mapbox_reverse_geocoding", status: "resolved" }, ...extra,
});
function crop(i: EngineInput, slug = "tomato") {
  const c = assessCrops(i).crops.find((c) => c.slug === slug);
  if (!c) throw new Error("Missing crop");
  return c;
}
const rain = (p: number) => input({ irrigation: "rainfed", climate: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, temperatureMeanC: 20, precipitationMm: p })) });

describe("MVP conservative safeguards (synthetic inputs, not actual local climate)", () => {
  it("A: normal reported irrigation yields six numeric, non-identical preliminary scores", () => {
    const r = assessCrops(input());
    expect(r.crops.map((c) => c.slug).sort()).toEqual(["cotton", "maize", "potato", "rice", "tomato", "wheat"]);
    expect(r.crops.every((c) => c.score !== null && c.score >= 0 && c.score <= 100)).toBe(true);
    expect(new Set(r.crops.map((c) => c.score)).size).toBeGreaterThan(1);
    expect(r.crops.every((c) => c.confidence === "Low")).toBe(true);
  });
  it("B: verified effective rain below 25% caps every crop at 35", () => {
    for (const c of assessCrops(rain(10)).crops) {
      expect(c.score).toBeLessThanOrEqual(35);
      expect(c.diagnostics?.riskCaps.find((r) => r.key === "severe_rainfed_deficit")?.cap).toBe(35);
    }
    const t = crop(rain(10));
    expect(t.diagnostics?.uncertaintyAdjustedScore).toBeGreaterThan(35);
    expect(t.score).toBe(35);
  });
  it("25% effective seasonal coverage applies cap 50, not extreme-aridity cap", () => {
    const t = crop(rain(78.125));
    expect(t.diagnostics?.rainfedWaterRatio).toBe(0.25);
    expect(t.scoreCap).toBe(50);
  });
  it("50% effective seasonal coverage no longer applies the rainfed-deficit cap", () => {
    const t = crop(rain(125));
    expect(t.diagnostics?.rainfedWaterRatio).toBe(0.5);
    expect(t.diagnostics?.riskCaps.some((c) => c.key.includes("rainfed"))).toBe(false);
  });
  it("C: missing climate stays null, caps at 45 and is not classified as verified aridity", () => {
    for (const c of assessCrops(input({ climate: null })).crops) {
      expect(c.score).not.toBeNull();
      expect(c.score).toBeLessThanOrEqual(45);
      expect(c.diagnostics?.rainfedWaterRatio).toBeNull();
      expect(c.diagnostics?.riskCaps.some((r) => r.key.includes("rainfed"))).toBe(false);
      expect(c.season?.precipitationMm).toBeNull();
    }
    expect(crop(input({ climate: null })).score).toBe(45);
  });
  it("D: high salinity without ECe enforces 40 and Low confidence without inventing salinity", () => {
    for (const c of assessCrops(input({ salinityRisk: "high" })).crops) {
      expect(c.score).not.toBeNull();
      expect(c.score).toBeLessThanOrEqual(40);
      expect(c.confidence).toBe("Low");
      expect(c.factors.find((f) => f.key === "salinity")?.score).toBeNull();
    }
    expect(crop(input({ salinityRisk: "high" })).score).toBe(40);
  });
  it("E: measured ECe keeps crop-specific Maas–Hoffman tolerance", () => {
    expect(crop(input({ salinityEce: 5 }), "cotton").factors.find((f) => f.key === "salinity")?.score).toBe(1);
    expect(crop(input({ salinityEce: 5 })).factors.find((f) => f.key === "salinity")?.score).toBeCloseTo(0.7525);
    expect(crop(input({ salinityEce: 30 })).score).toBeLessThanOrEqual(35);
  });
  it("F: unavailable soil factors remain null and do not suppress all numeric scores", () => {
    for (const c of assessCrops(input({ soil: null })).crops) {
      expect(c.score).not.toBeNull();
      expect(c.factors.find((f) => f.key === "ph")?.score).toBeNull();
    }
  });
  it("G: unverifiable district receives no cross-zone calendar points", () => {
    for (const c of assessCrops(input()).crops) {
      expect(c.factors.find((f) => f.key === "calendar")?.score).toBeNull();
      expect(c.score).not.toBeNull();
    }
  });
  it("below 50% coverage caps at 45, while exactly 50% caps at 60", () => {
    const sparse = crop(input({ climate: null }));
    expect(sparse.completeness).toBe(25);
    expect(sparse.score).toBe(45);
    const half = crop(input(), "cotton");
    expect(half.completeness).toBe(50);
    expect(half.score).toBe(60);
  });
  it("uncertainty shrinkage never improves an observed poor fit", () => {
    expect(uncertaintyScore(20, 25)).toBe(20);
    expect(uncertaintyScore(100, 50)).toBe(67.5);
    expect(uncertaintyScore(null, 0)).toBe(35);
  });
  it("invalid location or no usable inputs does not receive arbitrary scores", () => {
    expect(assessCrops(input({ location: null })).crops.every((c) => c.score === null)).toBe(true);
    expect(assessCrops(input({ soil: null, climate: null, plantingMonth: null, irrigation: "unknown" })).crops.every((c) => c.score === null)).toBe(true);
  });
  it("assessment does not mutate input measurements or shared profile requirements", () => {
    const i = input(), before = JSON.stringify(i), profiles = JSON.stringify(CROP_PROFILES);
    assessCrops(i);
    expect(JSON.stringify(i)).toBe(before);
    expect(JSON.stringify(CROP_PROFILES)).toBe(profiles);
  });
  it("H: provider failure cannot alter scoring from a validated saved historical summary", () => {
    const time: string[] = [];
    for (let d = new Date("2016-01-01T00:00:00Z"); d <= new Date("2025-12-31T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) time.push(d.toISOString().slice(0, 10));
    const values: DailySeries["values"] = { precipitation_sum: time.map(() => 3), rain_sum: time.map(() => null),
      temperature_2m_mean: time.map(() => 20), temperature_2m_min: time.map(() => 10), temperature_2m_max: time.map(() => 30), et0_fao_evapotranspiration: time.map(() => null) };
    const saved = { ...aggregate({ time, values }), source: "Open-Meteo", requested: { latitude: 41, longitude: 69 },
      start_date: "2016-01-01", end_date: "2025-12-31", status: "partial", sources: [{ model: "era5_land", dataset: "Synthetic legacy test", spatial_resolution: "test", variables: [], status: "partial" }],
      dataset: "Synthetic test", model: "era5_land", timezone: "UTC", resolution: "test", returned: { latitude: 41, longitude: 69, elevation_m: null },
      fetched_at: "2026-10-19", note: "Synthetic", errors: [], warnings: [], error_kind: null };
    const validated = validatedSavedClimate(saved, 41, 69);
    if (!validated) throw new Error("Test summary must validate");
    const i = input({ climate: validated.monthly.map((m) => ({ month: m.month, temperatureMeanC: m.temperature_mean_avg_c, precipitationMm: m.precipitation_avg_total_mm })) });
    const original = JSON.stringify(saved), before = assessCrops(i);
    const failedProvider = vi.fn(() => Promise.reject(new Error("Temporary provider failure")));
    vi.stubGlobal("fetch", failedProvider);
    expect(assessCrops(i)).toEqual(before);
    expect(failedProvider).not.toHaveBeenCalled();
    expect(JSON.stringify(saved)).toBe(original);
    expect(validated.summary?.avg_annual_et0_mm).toBeNull();
  });
});