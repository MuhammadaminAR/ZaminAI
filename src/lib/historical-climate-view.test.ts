import { describe, it, expect } from "vitest";
import { annualMetricStats } from "./historical-climate-view";
import type { AnnualSummary } from "./historical-weather.server";

function year(y: number, precip: number | null, temp: number | null): AnnualSummary {
  return {
    year: y,
    precipitation_total_mm: precip,
    rain_total_mm: precip,
    temperature_mean_c: temp,
    temperature_min_avg_c: temp,
    temperature_max_avg_c: temp,
    et0_total_mm: null,
    days_in_year: 365,
    valid_days: {} as AnnualSummary["valid_days"],
    reliable: precip !== null && temp !== null,
    flags: [],
  };
}

describe("per-metric availability", () => {
  it("A: uses all ten years when all are valid", () => {
    const annual = Array.from({ length: 10 }, (_, i) => year(2016 + i, 100, 12));
    const s = annualMetricStats(annual, (a) => a.precipitation_total_mm);
    expect(s.years).toHaveLength(10);
    expect(s.average).toBe(100);
  });

  it("B: averages over only the eight valid years", () => {
    const annual = Array.from({ length: 10 }, (_, i) => year(2016 + i, i < 8 ? 100 : null, 12));
    const s = annualMetricStats(annual, (a) => a.precipitation_total_mm);
    expect(s.years).toHaveLength(8);
    expect(s.average).toBe(100);
  });

  it("C: four valid years still produce an average from valid data only", () => {
    const annual = Array.from({ length: 10 }, (_, i) => year(2016 + i, i < 4 ? 200 : null, 12));
    const s = annualMetricStats(annual, (a) => a.precipitation_total_mm);
    expect(s.years).toEqual([2016, 2017, 2018, 2019]);
    expect(s.average).toBe(200);
    expect(s.max).toEqual({ year: 2019, value: 200 });
  });

  it("D: temperature stays available when another metric is null everywhere", () => {
    const annual = Array.from({ length: 10 }, (_, i) => year(2016 + i, null, 12));
    expect(annualMetricStats(annual, (a) => a.et0_total_mm).average).toBeNull();
    const t = annualMetricStats(annual, (a) => a.temperature_mean_c);
    expect(t.years).toHaveLength(10);
    expect(t.average).toBe(12);
  });

  it("E: a metric with no valid data yields null, never zero", () => {
    const annual = Array.from({ length: 10 }, (_, i) => year(2016 + i, null, null));
    const s = annualMetricStats(annual, (a) => a.precipitation_total_mm);
    expect(s.average).toBeNull();
    expect(s.years).toHaveLength(0);
    expect(s.max).toBeNull();
    expect(s.min).toBeNull();
  });
});
