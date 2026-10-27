import { describe, expect, it } from "vitest";
import { assessCrops, seasonMonths, tempScore, textureGroup, WEIGHTS, type EngineInput, type MonthClimate } from "./engine";
import { isExposedAralSeabed } from "./aral-seabed";

// Synthetic arid continental climatology (roughly Uzbek lowland shape).
const T = [0, 3, 10, 16, 22, 27, 29, 27, 21, 14, 7, 2];
const P = [40, 45, 60, 50, 25, 5, 2, 1, 3, 20, 35, 40];
const climate: MonthClimate[] = T.map((t, i) => ({ month: i + 1, temperatureMeanC: t, precipitationMm: P[i] ?? null }));
const soil = { ph: 7.6, clayPct: 22, sandPct: 25, siltPct: 53 };
const get = (r: ReturnType<typeof assessCrops>, slug: string) => r.crops.find((c) => c.slug === slug)!;

const base = (over: Partial<EngineInput> = {}): EngineInput => ({
  soil, climate, irrigation: "reliable", plantingMonth: 4, salinityEce: null, salinityRisk: "standard",
  location: { countryCode: "UZ", region: "Tashkent region", district: "Chinaz", source: "mapbox_reverse_geocoding", status: "resolved", latitude: 41, longitude: 69 }, ...over,
});

describe("crop suitability engine", () => {
  it("weights total 100", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("is deterministic", () => {
    expect(assessCrops(base())).toEqual(assessCrops(base()));
  });
  it("never assumes irrigation: unknown irrigation leaves water unscored with conservative numeric scores", () => {
    const r = assessCrops(base({ irrigation: "unknown" }));
    for (const c of r.crops) {
      expect(c.factors.find((f) => f.key === "water")!.status).toBe("unavailable");
      expect(c.score).not.toBeNull();
      expect(c.confidence).toBe("Low");
    }
  });
  it("irrigation changes the result: rain-fed tomato scores lower than irrigated", () => {
    const irr = get(assessCrops(base()), "tomato");
    const rf = get(assessCrops(base({ irrigation: "rainfed" })), "tomato");
    expect(irr.score!).toBeGreaterThan(rf.score!);
  });
  it("cotton keeps unsupported soil factors unavailable and uses preliminary policy", () => {
    const c = get(assessCrops(base()), "cotton");
    expect(c.factors.find((f) => f.key === "ph")!.status).toBe("unavailable");
    expect(c.score).not.toBeNull();
  });
  it("planting month changes the result: tomato in April beats tomato in October", () => {
    const apr = get(assessCrops(base()), "tomato");
    const oct = get(assessCrops(base({ plantingMonth: 10 })), "tomato");
    expect(apr.score!).toBeGreaterThan(oct.score!);
  });
  it("missing soil is not zero: pH/texture become unavailable, not 0", () => {
    const r = get(assessCrops(base({ soil: { ph: null, clayPct: null, sandPct: null, siltPct: null } })), "potato");
    const ph = r.factors.find((f) => f.key === "ph")!;
    expect(ph.status).toBe("unavailable");
    expect(ph.score).toBeNull();
    expect(r.completeness).toBe(60); // temperature 25 + water 25 + calendar 10 (FAO window); salinity unassessed
  });
  it("no climate → capped preliminary scores for every crop", () => {
    const r = assessCrops(base({ climate: null }));
    expect(r.crops.every((c) => c.score !== null && c.score <= 45)).toBe(true);
  });
  it("wheat and rice retain unavailable temperature without suppressing preliminary scores", () => {
    const r = assessCrops(base());
    expect(get(r, "wheat").score).not.toBeNull();
    expect(get(r, "rice").score).not.toBeNull();
  });
  it("helpers", () => {
    expect(seasonMonths(11, [150, 180])).toEqual([11, 12, 1, 2, 3, 4]);
    expect(tempScore(19, { optimum: [18, 20], lowerLimit: 10, upperLimit: 30 })).toBe(1);
    expect(tempScore(10, { optimum: [18, 20], lowerLimit: 10, upperLimit: 30 })).toBe(0);
    expect(textureGroup(25, 53, 22).cls).toBe("silt loam");
    expect(textureGroup(20, 20, 60).group).toBe("fine");
  });
});

describe("soil salinity rules", () => {
  it("TEST A: exposed Aral seabed + reliable irrigation + no ECe → preliminary numeric scores capped at 40", () => {
    // The regression: tomato previously scored 70/100 here with "reliable irrigation".
    const r = assessCrops(base({ salinityRisk: "high", plantingMonth: 6 }));
    for (const c of r.crops) {
      expect(c.score).not.toBeNull();
      expect(c.confidence).toBe("Low");
      expect(c.score).toBeLessThanOrEqual(40);
    }
    expect(r.salinity.riskZone).toBe(true);
    expect(r.salinity.assessed).toBe(false);
    expect(r.salinity.warning).toContain("Soil salinity not verified");
    const tomato = get(r, "tomato");
    expect(tomato.factors.find((f) => f.key === "salinity")!.status).toBe("unavailable");
    expect(tomato.limitations.join(" ")).toContain("Soil salinity not verified");
  });
  it("TEST B: normal farmland without ECe → scored from verified inputs, salinity flagged unverified and preliminary", () => {
    const r = assessCrops(base());
    const tomato = get(r, "tomato");
    expect(tomato.score).not.toBeNull();
    expect(tomato.factors.find((f) => f.key === "salinity")!.status).toBe("unavailable");
    expect(tomato.completeness).toBe(85); // temp 25 + water 25 + ph 15 + texture 10 + calendar 10; salinity 15 missing
    expect(tomato.confidence).toBe("Low"); // Medium requires salinity assessed
    expect(tomato.needsVerification.join(" ")).toContain("salinity");
    expect(r.salinity.warning).toContain("preliminary");
  });
  it("TEST C: no salinity coverage anywhere → 'not assessed', never 'non-saline'", () => {
    const r = assessCrops(base());
    expect(r.salinity.assessed).toBe(false);
    expect(r.salinity.eceDsPerM).toBeNull();
    for (const c of r.crops) {
      const f = c.factors.find((x) => x.key === "salinity")!;
      expect(f.status).toBe("unavailable");
      expect(f.score).toBeNull();
    }
  });
  it("TEST D: with a real ECe value, crop-specific tolerance drives the score", () => {
    // ECe 5 dS/m: above tomato threshold 2.5 (slope 9.9) but below cotton threshold 7.7.
    const r = assessCrops(base({ salinityEce: 5, salinityRisk: "high" }));
    expect(r.salinity.assessed).toBe(true);
    expect(r.salinity.warning).toBeNull();
    const tomato = get(r, "tomato");
    const cotton = get(r, "cotton");
    const tf = tomato.factors.find((f) => f.key === "salinity")!;
    const cf = cotton.factors.find((f) => f.key === "salinity")!;
    expect(tf.status).toBe("scored");
    expect(tf.score!).toBeCloseTo(1 - (9.9 * (5 - 2.5)) / 100, 5);
    expect(cf.score).toBe(1);
    // Salt-sensitive tomato's salinity factor scores far below salt-tolerant cotton's.
    expect(tf.score!).toBeLessThan(cf.score!);
    // Confidence can reach Medium only with salinity assessed (cotton stays Low: its pH/texture rules are unverified).
    expect(tomato.confidence).toBe("Low"); // irrigation quantity/quality/drainage unverified
    expect(cotton.confidence).toBe("Low");
  });
  it("TEST D2: extreme salinity (ECe 30) zeroes even cotton's salinity factor", () => {
    const r = assessCrops(base({ salinityEce: 30 }));
    const cf = get(r, "cotton").factors.find((f) => f.key === "salinity")!;
    expect(cf.score).toBe(0);
  });
  it("TEST E: no SoilGrids data → no invented salinity or soil values, conservative scores without fabricated soil", () => {
    const r = assessCrops(base({ soil: null }));
    for (const c of r.crops) {
      for (const key of ["ph", "texture", "salinity"] as const) {
        const f = c.factors.find((x) => x.key === key)!;
        expect(f.status).toBe("unavailable");
        expect(f.score).toBeNull();
      }
      expect(c.score).not.toBeNull();
      expect(c.confidence).toBe("Low");
    }
  });
});

describe("exposed Aral seabed screening zone", () => {
  it("identifies exposed seabed points", () => {
    expect(isExposedAralSeabed(45.5, 60.0)).toBe(true); // central dried seabed
    expect(isExposedAralSeabed(44.9, 58.6)).toBe(true); // western dried seabed
  });
  it("excludes current water and land outside the historic extent", () => {
    expect(isExposedAralSeabed(45.0, 58.5)).toBe(false); // current South Aral water
    expect(isExposedAralSeabed(46.1, 60.8)).toBe(false); // current North Aral water
    expect(isExposedAralSeabed(42.46, 59.61)).toBe(false); // Nukus
    expect(isExposedAralSeabed(41.3, 69.2)).toBe(false); // Tashkent
  });
});

describe("v3 rules: effective rainfall, irrigation, FAO calendar, reproducibility", () => {
  it("FAO effective rainfall formula", async () => {
    const { effectiveRainfall } = await import("./engine");
    expect(effectiveRainfall(100)).toBe(55); // 0.8*100-25
    expect(effectiveRainfall(50)).toBe(20); // 0.6*50-10
    expect(effectiveRainfall(10)).toBe(0); // never negative
  });
  it("reliable irrigation is not a perfect water score", () => {
    const w = get(assessCrops(base()), "tomato").factors.find((f) => f.key === "water")!;
    expect(w.score!).toBeLessThan(1);
    expect(w.score!).toBeGreaterThanOrEqual(0.8);
  });
  it("bare district names are not sufficient geographic evidence", async () => {
    const { resolveCalendarZone } = await import("./zone-resolution");
    expect(resolveCalendarZone({ district: "Urgut District" }).zoneId).toBeNull();
    expect(resolveCalendarZone({ district: "Khiva" }).zoneId).toBeNull();
    expect(resolveCalendarZone({ district: "Chirchik" }).zoneId).toBeNull();
    expect(resolveCalendarZone({ district: "Nowhere" }).zoneId).toBeNull();
  });
  it("wheat in October in zone 001 is in the FAO window and uses the 215–218 day winter season", () => {
    const w = get(assessCrops(base({ plantingMonth: 10 })), "wheat");
    const cal = w.factors.find((f) => f.key === "calendar")!;
    expect(cal.score).toBe(1);
    expect(cal.validation).toBe("verified");
    expect(w.season!.months.length).toBe(8);
  });
  it("unmatched district → calendar unavailable, not national credit", () => {
    const cal = get(assessCrops(base({ plantingMonth: 3, location: null })), "tomato").factors.find((f) => f.key === "calendar");
    expect(cal?.status).toBe("unavailable");
    expect(cal?.score).toBeNull();
  });
  it("cotton and maize have no FAO Uzbekistan calendar → unavailable, not zero", () => {
    const r = assessCrops(base());
    for (const s of ["cotton", "maize"]) {
      const cal = get(r, s).factors.find((f) => f.key === "calendar")!;
      expect(cal.status).toBe("unavailable");
      expect(cal.score).toBeNull();
    }
  });
  it("every score is reproducible from stored factors, weights and cap", () => {
    for (const m of [1, 3, 4, 7, 10]) for (const irrigation of ["reliable", "limited", "rainfed"] as const) {
      for (const c of assessCrops(base({ plantingMonth: m, irrigation, salinityEce: 3 })).crops) {
        if (c.score === null) continue;
        const sc = c.factors.filter((f) => f.status === "scored");
        const coverage = sc.reduce((a, f) => a + f.weight, 0);
        const average = sc.reduce((a, f) => a + f.weight * (f.score ?? 0), 0) / coverage * 100;
        let s = average * coverage / 100 + Math.min(average, 35) * (100 - coverage) / 100;
        if (c.scoreCap !== null) s = Math.min(s, c.scoreCap);
        expect(c.score).toBe(Math.round(s));
      }
    }
  });
  it("missing data never yields Medium confidence", () => {
    for (const c of assessCrops(base({ soil: null, salinityEce: null })).crops) expect(c.confidence).toBe("Low");
  });
});
