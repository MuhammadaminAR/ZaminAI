import { describe, it, expect } from "vitest";
import { aggregate, type DailySeries } from "./historical-weather.server";

function series(year: number, fill: (date: string, i: number) => number | null): DailySeries {
  const time: string[] = [];
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) {
    time.push(d.toISOString().slice(0, 10));
  }
  const vals = time.map(fill);
  return { time, values: {
    temperature_2m_mean: vals, temperature_2m_max: vals, temperature_2m_min: vals,
    precipitation_sum: vals, rain_sum: vals, et0_fao_evapotranspiration: vals,
  } };
}

describe("historical aggregation", () => {
  it("sums annual precipitation from daily values", () => {
    const r = aggregate(series(2020, () => 1), 2020, 2020);
    expect(r.annual[0]!.precipitation_total_mm).toBe(366);
    expect(r.monthly[1]!.precipitation_avg_total_mm).toBe(29); // Feb 2020 monthly total, not daily
  });
  it("skips missing values instead of treating them as zero", () => {
    const r = aggregate(series(2021, (_, i) => (i < 10 ? null : 2)), 2021, 2021);
    expect(r.annual[0]!.valid_days.precipitation_sum).toBe(355);
    expect(r.annual[0]!.temperature_mean_c).toBe(2);
  });
  it("flags a year with insufficient data rather than inventing totals", () => {
    const r = aggregate(series(2022, (_, i) => (i < 100 ? null : 1)), 2022, 2022);
    expect(r.annual[0]!.reliable).toBe(false);
    expect(r.annual[0]!.precipitation_total_mm).toBeNull();
  });
});
