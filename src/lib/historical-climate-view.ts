/**
 * Pure view helpers for the Historical Climate section.
 * Derive per-metric availability from the existing historical-weather response:
 * a year/month is usable for a metric only when that metric's value is non-null
 * (the backend already nulls values that fail its coverage checks). Missing is
 * never zeroed, filled, or interpolated.
 */
import type { AnnualSummary, MonthlyClimate } from "./historical-weather.server";

export interface MetricAvailability {
  /** Years with a valid value for this metric, ascending. */
  years: number[];
  /** Average over the valid years only; null when no valid year exists. */
  average: number | null;
  /** Wettest/highest valid year; null when none. */
  max: { year: number; value: number } | null;
  /** Driest/lowest valid year; null when none. */
  min: { year: number; value: number } | null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Per-metric stats over the annual series, using only years with valid data. */
export function annualMetricStats(
  annual: AnnualSummary[],
  pick: (a: AnnualSummary) => number | null,
): MetricAvailability {
  const valid = annual
    .map((a) => ({ year: a.year, value: pick(a) }))
    .filter((x): x is { year: number; value: number } => x.value !== null);
  if (!valid.length) return { years: [], average: null, max: null, min: null };
  const avg = round1(valid.reduce((s, x) => s + x.value, 0) / valid.length);
  const sorted = [...valid].sort((a, b) => a.value - b.value);
  return {
    years: valid.map((x) => x.year),
    average: avg,
    min: sorted[0]!,
    max: sorted.at(-1)!,
  };
}

/** Count of years with a valid value for a monthly metric (from the response's valid_years). */
export function monthlyValidYears(m: MonthlyClimate, variable: keyof MonthlyClimate["valid_years"]): number {
  return m.valid_years[variable] ?? 0;
}

/**
 * Whether a historical result may be saved for an analysis. Only usable results where
 * every dataset answered are saved; a failed dataset (e.g. HTTP 429) is never frozen
 * into the saved record, and errors never overwrite a saved summary.
 */
export function isSavableClimate(r: Pick<import("./historical-weather.server").HistoricalWeatherResult, "status" | "annual" | "monthly" | "sources">): boolean {
  if (r.status !== "success" && r.status !== "partial") return false;
  if (!r.annual.length || !r.monthly.length) return false;
  return !r.sources.some((s) => s.status === "error");
}
