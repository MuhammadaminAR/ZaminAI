import { describe, expect, it } from "vitest";
import { normalizeGeographicName, resolveCalendarZone, type CalendarLocation } from "./zone-resolution";
import { assessCrops, RULES_VERSION } from "./engine";
import { UZ_AEZ } from "./profiles";

const evidence = (district: string | null, region: string, extra: Partial<CalendarLocation> = {}): CalendarLocation => ({
  countryCode: "UZ", region, district, locality: null, source: "mapbox_reverse_geocoding", status: "resolved",
  latitude: 40.9284976399623, longitude: 69.5308396986333, ...extra,
});

describe("application-wide calendar zone resolution", () => {
  it.each(["Okhangaron", "Akhangaran", "O‘hangaron", "Oʻhangaron", "Ohangaron", "Оҳангарон", "Ахангаран"])("explicit district alias %s resolves to FAO 001", (district) => {
    const r = resolveCalendarZone(evidence(district, "Tashkent region"));
    expect(r.zoneId).toBe("001");
    expect(r.canonicalUnit).toBe("UZ-TO:fao:akhangaran");
  });
  it("the exact saved point with no district cannot use its locality as district proof", () => {
    const r = resolveCalendarZone(evidence(null, "Tashkent region", { locality: "Okhangaron" }));
    expect(r.status).toBe("unavailable");
    expect(r.zoneId).toBeNull();
  });
  it.each([
    ["001", "Chinoz tumani", "Toshkent viloyati", "001"],
    ["002", "Chirchiq", "Tashkent region", null],
    ["003", "Bustonlik", "Tashkent region", null],
    ["004", "Гулистон", "Sirdaryo region", "004"],
    ["005", "Ургут", "Samarqand viloyati", "005"],
    ["006", "Angor", "Surxondaryo viloyati", "006"],
    ["007", "Карши", "Qashqadaryo viloyati", "007"],
    ["008", "Buxoro", "Bukhara region", "008"],
    ["009", "Хива", "Khorezm region", "009"],
  ])("FAO %s representative geographic evidence: %s", (_zone, district, region, expected) => {
    expect(resolveCalendarZone(evidence(district, region)).zoneId).toBe(expected);
  });
  it("audits every FAO unit: ambiguous membership never resolves and unmapped units stay unavailable", () => {
    for (const unit of new Set(UZ_AEZ.flatMap((z) => z.units))) {
      const memberships = UZ_AEZ.filter((z) => z.units.includes(unit)).map((z) => z.id);
      for (const region of ["Andijan", "Bukhara", "Fergana", "Jizzakh", "Namangan", "Navoiy", "Kashkadarya", "Republic of Karakalpakstan", "Samarkand", "Sirdaryo", "Surkhandarya", "Tashkent city", "Tashkent region", "Khorezm"]) {
        const r = resolveCalendarZone(evidence(unit, region));
        if (memberships.length > 1) expect(r.zoneId).toBeNull();
        if (r.zoneId) expect(memberships).toEqual([r.zoneId]);
      }
    }
  });
  it.each(["Tashkent", "Chirchik", "Bustonlik", "Kumkurgon", "Chiroqchi"])("multi-zone unit %s is unavailable", (district) => {
    const region = district === "Kumkurgon" ? "Surkhandarya" : district === "Chiroqchi" ? "Kashkadarya" : "Tashkent region";
    expect(resolveCalendarZone(evidence(district, region)).zoneId).toBeNull();
  });
  it.each([
    { district: "Nowhere" }, { district: "Akhangarann" }, { district: null, locality: "Khiva" },
    { region: "Unknown" }, { region: "Khorezm" }, { countryCode: "KZ" },
    { source: "unresolved" }, { status: "needs_review" }, { latitude: NaN }, { latitude: 95 },
  ])("rejects unverifiable or conflicting evidence %j", (extra) => {
    expect(resolveCalendarZone(evidence("Akhangaran", "Tashkent region", extra)).zoneId).toBeNull();
  });
  it("normalization does not strip Cyrillic into a false match or guess similar spellings", () => {
    expect(normalizeGeographicName("Oʻhangaron tumani")).toBe("ohangaron");
    expect(normalizeGeographicName("Оҳангарон")).toBe("оҳангарон");
    expect(resolveCalendarZone(evidence("Ohangar", "Tashkent region")).status).toBe("unavailable");
  });
  it.each([["Angren", "Tashkent region"], ["Mirzohul", "Jizzakh"], ["Xonda", "Khorezm"], ["Myrishkor", "Kashkadarya"], ["Sarob", "Sirdaryo"], ["Khiva city", "Khorezm"], ["Qarshi shahri", "Kashkadarya"]])("unsupported identity %s never earns zone verification", (district, region) => {
    expect(resolveCalendarZone(evidence(district, region)).zoneId).toBeNull();
  });
});

const soil = { ph: 7.7, clayPct: 24.8, sandPct: 20.6, siltPct: 45.8 };
const temperature = [2.4, 4.6, 10.2, 15.3, 21.1, 26.7, 29.2, 26.4, 21.4, 14.2, 7.3, 3.1];
const precipitation = [45.1, 62.2, 88.9, 62.9, 31.5, 7.3, 2.8, 2.8, 3, 32.4, 50.1, 49.2];
const assess = (month: number, location: CalendarLocation, extra = {}) => assessCrops({ soil,
  climate: temperature.map((t, i) => ({ month: i + 1, temperatureMeanC: t, precipitationMm: precipitation[i] ?? null })),
  irrigation: "reliable", plantingMonth: month, salinityEce: null, salinityRisk: "standard", location, ...extra,
});

describe("zone-restricted calendar scoring", () => {
  it.each([[4, 0.5], [6, 0]])("verified 001 tomato in month %s gets only its local credit %s", (month, expected) => {
    const r = assess(month, evidence("Ohangaron", "Tashkent region"));
    expect(r.crops.find((c) => c.slug === "tomato")?.factors.find((f) => f.key === "calendar")?.score).toBe(expected);
    expect(r.rulesVersion).toBe(RULES_VERSION);
  });
  it.each([4, 6])("unverified point in month %s has no calendar credit, even with lab salinity", (month) => {
    const r = assess(month, evidence(null, "Tashkent region", { locality: "Okhangaron" }), { salinityEce: 3 });
    for (const c of r.crops) {
      expect(c.factors.find((f) => f.key === "calendar")?.score).toBeNull();
      expect(c.factors.find((f) => f.key === "calendar")?.status).toBe("unavailable");
      expect(c.confidence).toBe("Low");
    }
    expect(r.crops.find((c) => c.slug === "tomato")?.completeness).toBe(90);
  });
  it("missing calendar and soil inputs keeps conservative preliminary scores", () => {
    const r = assess(4, evidence(null, "Tashkent region"), { soil: null });
    expect(r.crops.every((c) => c.score !== null && c.score <= 60)).toBe(true);
  });
  it("verified zone lacking a crop calendar cannot borrow another zone's season", () => {
    const r = assess(4, evidence("Urgut", "Samarkand"));
    expect(r.crops.find((c) => c.slug === "tomato")?.factors.find((f) => f.key === "calendar")?.score).toBeNull();
  });
  it("new saved factors contain reproducible zone evidence and scores without changing soil values", () => {
    const original = { ...soil };
    for (const month of [4, 6]) for (const district of [null, "Ohangaron"]) {
      const r = assess(month, evidence(district, "Tashkent region"));
      expect(r.rulesVersion).toBe(RULES_VERSION);
      for (const c of r.crops) {
        expect(c.factors.find((f) => f.key === "calendar")?.zoneResolution).toEqual(r.zoneResolution);
        if (c.score === null) continue;
        const scored = c.factors.filter((f) => f.score !== null);
        const coverage = scored.reduce((sum, f) => sum + f.weight, 0);
        const average = scored.reduce((sum, f) => sum + f.weight * (f.score ?? 0), 0) / coverage * 100;
        const raw = average * coverage / 100 + Math.min(average, 35) * (100 - coverage) / 100;
        expect(c.score).toBe(Math.round(c.scoreCap === null ? raw : Math.min(raw, c.scoreCap)));
      }
    }
    expect(soil).toEqual(original);
  });
});