import { describe, it, expect, vi } from "vitest";
import { assessSoilCrops, type SoilOnlyInput } from "./soil-engine";
import { SOIL_RULES_VERSION, SOIL_POLICY } from "./soil-policy";
const input: SoilOnlyInput = { soil: { ph: 5.5, sandPct: 40, clayPct: 20, siltPct: 40, nitrogenGPerKg: 1, organicCarbonGPerKg: 5, cecCmolPerKg: 12 }, latitude: 41.3, longitude: 69.2, countryCode: "UZ", salinityEce: null, salinityRisk: "standard" };
describe("soil-only MVP", () => {
  it("six crops receive deterministic preliminary scores with usable SoilGrids inputs", () => {
    const a = assessSoilCrops(input);
    expect(a.crops.map((c) => c.slug).sort()).toEqual(["cotton", "maize", "potato", "rice", "tomato", "wheat"]);
    expect(a.crops.every((c) => c.score !== null)).toBe(true);
    expect(a).toEqual(assessSoilCrops(input));
    expect(a.rulesVersion).toBe("suitability-rules-v7-soil-renormalized");
  });
  it("no artificial cap: strong measured fits score above 80, up to 100", () => {
    const a = assessSoilCrops(input);
    // pH 5.5, loam (medium): potato and tomato are full fits; cotton/wheat 0.5 pH units below range.
    expect(a.crops.find((c) => c.slug === "potato")?.score).toBe(100);
    expect(a.crops.find((c) => c.slug === "tomato")?.score).toBe(100);
    expect(a.crops.find((c) => c.slug === "cotton")?.score).toBe(85);
    expect(a.crops.find((c) => c.slug === "wheat")?.score).toBe(85);
    expect(a.crops.find((c) => c.slug === "potato")?.level).toBe("Strong soil match");
  });
  it("cotton, wheat and maize now use verified FAO EcoCrop pH rules instead of a flat allowance", () => {
    const a = assessSoilCrops(input);
    expect(a.crops.find((c) => c.slug === "cotton")?.factors.find((f) => f.key === "ph")?.validation).toBe("verified");
    expect(a.crops.find((c) => c.slug === "cotton")?.completeness).toBe(100);
    expect(a.crops.find((c) => c.slug === "maize")?.completeness).toBe(60); // pH scored, texture rule unverified
    expect(a.crops.find((c) => c.slug === "maize")?.score).toBe(100);
  });
  it("missing measurements reduce confidence and completeness, never the score", () => {
    const a = assessSoilCrops({ ...input, soil: { ...input.soil, ph: null, sandPct: 40, siltPct: 40, clayPct: 20 } });
    const tomato = a.crops.find((c) => c.slug === "tomato");
    expect(tomato?.factors.find((f) => f.key === "ph")?.score).toBeNull();
    expect(tomato?.score).toBe(100); // weighted average of the available texture factor only
    expect(tomato?.completeness).toBe(40);
    expect(tomato?.confidence).toBe("Low");
  });
  it("genuinely restrictive soil still scores low", () => {
    const a = assessSoilCrops({ ...input, soil: { ...input.soil, ph: 3, sandPct: 10, siltPct: 30, clayPct: 60 } });
    const tomato = a.crops.find((c) => c.slug === "tomato");
    expect(tomato?.score).toBe(12); // pH 3 scores 0; fine texture mismatch 0.3 × 40% weight
    expect(tomato?.level).toBe("Substantial soil limitations");
    expect(a.crops.find((c) => c.slug === "cotton")?.score).toBe(40); // pH 0, fine texture matches cotton
  });
  it("no SoilGrids data or invalid geography means no fictional scores", () => {
    for (const data of [{ ...input, soil: null }, { ...input, countryCode: "US" }, { ...input, latitude: 0 }]) expect(assessSoilCrops(data).crops.every((c) => c.score === null)).toBe(true);
    expect(assessSoilCrops({ ...input, soil: { ph: null, clayPct: null, sandPct: null, siltPct: null } }).crops.every((c) => c.score === null)).toBe(true);
  });
  it("validated high salinity without ECe caps at 40 and keeps low confidence", () => {
    const a = assessSoilCrops({ ...input, salinityRisk: "high" });
    expect(a.crops.find((c) => c.slug === "tomato")?.score).toBe(40);
    expect(a.crops.every((c) => (c.score ?? 101) <= 40 && c.confidence === "Low")).toBe(true);
    expect(a.salinity.assessed).toBe(false);
  });
  it("ECe safety can reduce but never boost soil compatibility", () => {
    const normal = assessSoilCrops(input), lab = assessSoilCrops({ ...input, salinityEce: 20 });
    for (const c of lab.crops) expect(c.score ?? 101).toBeLessThanOrEqual(normal.crops.find((p) => p.slug === c.slug)?.score ?? -1);
    expect(lab.crops.find((c) => c.slug === "tomato")?.score).toBe(0);
  });
  it("unsupported nitrogen carbon CEC never become fertility credit", () => {
    const a = assessSoilCrops(input), b = assessSoilCrops({ ...input, soil: { ...input.soil, ph: 5.5, sandPct: 40, siltPct: 40, clayPct: 20, nitrogenGPerKg: 999, organicCarbonGPerKg: 999, cecCmolPerKg: 999 } });
    expect(a.crops.map((c) => c.score)).toEqual(b.crops.map((c) => c.score));
    expect(a.crops.every((c) => c.factors.filter((f) => ["nitrogen", "organic_carbon", "cec"].includes(f.key)).every((f) => f.score === null && f.weight === 0))).toBe(true);
  });
  it("weather outage and extra legacy climate inputs have no effect, fetch is never called", () => {
    const fetch = vi.fn().mockRejectedValue(new Error("HTTP 429")); vi.stubGlobal("fetch", fetch);
    try { expect(assessSoilCrops({ ...input, climate: [], irrigation: "rainfed", plantingMonth: 12 } as SoilOnlyInput)).toEqual(assessSoilCrops(input)); expect(fetch).not.toHaveBeenCalled(); }
    finally { vi.unstubAllGlobals(); }
  });
  it("does not mutate inputs and excludes old numeric factor keys", () => {
    const before = JSON.stringify(input); const a = assessSoilCrops(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(a.crops.every((c) => c.factors.every((f) => !["temperature", "water", "calendar", "salinity"].includes(f.key)))).toBe(true);
    expect(a.crops.every((c) => c.diagnostics?.rulesVersion === SOIL_RULES_VERSION && c.season === null)).toBe(true);
  });
  it("policy has no overall cap and a gradual two-unit pH decline", () => {
    expect("overallCap" in SOIL_POLICY).toBe(false);
    expect(SOIL_POLICY.phDeclineSpan).toBe(2);
  });
  it("real cotton-35 field (pH 7.7, fractions summing to 89.1) rescores from real measurements", () => {
    // Saved SoilGrids row for analysis fa9801cf: fractions are complete but sum to 89.1,
    // so they are rescaled to 100 (clay loam, fine) instead of being discarded.
    const a = assessSoilCrops({ ...input, soil: { ph: 7.7, sandPct: 31.3, siltPct: 33.5, clayPct: 24.3 } });
    const by = (s: string) => a.crops.find((c) => c.slug === s);
    expect(by("cotton")?.score).toBe(94); // pH 0.2 above range (0.9) + fine texture match
    expect(by("wheat")?.score).toBe(51); // pH 0.65, fine texture mismatch
    expect(by("tomato")?.score).toBe(51);
    expect(by("potato")?.score).toBe(21); // pH far above potato's 5–6 range
    expect(by("maize")?.score).toBe(65); // pH only; no verified texture rule
    expect(by("rice")?.score).toBe(65);
    expect(by("cotton")?.factors.find((f) => f.key === "texture")?.detail).toContain("rescaled");
  });
  it("implausible texture sums outside 80–120 stay unavailable, never zero-filled", () => {
    const a = assessSoilCrops({ ...input, soil: { ph: 6.5, sandPct: 10, siltPct: 10, clayPct: 10 } });
    expect(a.crops.find((c) => c.slug === "cotton")?.factors.find((f) => f.key === "texture")?.score).toBeNull();
    expect(a.crops.find((c) => c.slug === "cotton")?.completeness).toBe(60);
  });
});
