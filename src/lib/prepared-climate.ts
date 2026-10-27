import { z } from "zod";
import type { HistoricalWeatherResult, SourceMeta } from "./historical-weather.server";

export const BASELINE_START = "2016-01-01";
export const BASELINE_END = "2025-12-31";
const nullableNumber = z.number().finite().nullable();
const counts = z.object({
  temperature_2m_mean: z.number().int().min(0).max(366), temperature_2m_min: z.number().int().min(0).max(366),
  temperature_2m_max: z.number().int().min(0).max(366), precipitation_sum: z.number().int().min(0).max(366),
  rain_sum: z.number().int().min(0).max(366), et0_fao_evapotranspiration: z.number().int().min(0).max(366),
});
export const annualSchema = z.object({
  year: z.number().int().min(2016).max(2025), precipitation_total_mm: nullableNumber,
  rain_total_mm: nullableNumber, temperature_mean_c: nullableNumber, temperature_min_avg_c: nullableNumber,
  temperature_max_avg_c: nullableNumber, et0_total_mm: nullableNumber, days_in_year: z.number().int().min(365).max(366),
  valid_days: counts, reliable: z.boolean(), flags: z.array(z.string()),
  valid_months: z.object({ precipitation_sum: z.number().int().min(0).max(12) }).optional(),
});
export const monthlySchema = z.object({
  month: z.number().int().min(1).max(12), precipitation_avg_total_mm: nullableNumber,
  rain_avg_total_mm: nullableNumber, temperature_mean_avg_c: nullableNumber, temperature_min_avg_c: nullableNumber,
  temperature_max_avg_c: nullableNumber, et0_avg_total_mm: nullableNumber,
  valid_years: counts.refine((c) => Object.values(c).every((n) => n <= 10)),
});
const sourceSchema = z.object({
  model: z.enum(["era5", "era5_land", "chirps_v3", "era5_land_cds"]), dataset: z.string(),
  spatial_resolution: z.string(), variables: z.array(z.string()), status: z.enum(["success", "partial", "no_data", "error"]),
  returned: z.object({ latitude: nullableNumber, longitude: nullableNumber, elevation_m: nullableNumber }).optional(),
  errors: z.array(z.string()).optional(),
}).passthrough();
const resultSchema = z.object({
  source: z.enum(["Open-Meteo", "CHIRPS v3 / Climate Hazards Center + Copernicus ERA5-Land / ECMWF"]),
  requested: z.object({ latitude: z.number().finite(), longitude: z.number().finite() }),
  start_date: z.literal(BASELINE_START), end_date: z.literal(BASELINE_END),
  status: z.enum(["success", "partial"]), sources: z.array(sourceSchema).min(1),
  dataset: z.string(), model: z.string(), timezone: z.string(), resolution: z.string(),
  returned: z.object({ latitude: nullableNumber, longitude: nullableNumber, elevation_m: nullableNumber }),
  fetched_at: z.string(), note: z.string(), errors: z.array(z.string()), warnings: z.array(z.string()),
  error_kind: z.enum(["provider_error", "rate_limited", "timeout", "no_data"]).nullable(),
  annual: z.array(annualSchema).length(10), monthly: z.array(monthlySchema).length(12),
  summary: z.object({}).passthrough().nullable(),
}).passthrough();

/** Read validation: never relabel legacy data, never trust mismatched coordinates or malformed summaries. */
export function validatedSavedClimate(value: unknown, latitude: number, longitude: number): HistoricalWeatherResult | null {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success) return null;
  const r = parsed.data;
  if (r.requested.latitude !== latitude || r.requested.longitude !== longitude || r.sources.some((s) => s.status === "error")) return null;
  if (new Set(r.annual.map((a) => a.year)).size !== 10 || new Set(r.monthly.map((m) => m.month)).size !== 12) return null;
  return value as HistoricalWeatherResult;
}

export const cellPayloadSchema = z.object({
  source: sourceSchema.extend({ model: z.enum(["chirps_v3", "era5_land_cds"]),
    attribution_url: z.string().url(), licence: z.string().min(1),
    period: z.object({ start: z.literal(BASELINE_START), end: z.literal(BASELINE_END) }),
  }),
  annual: z.array(annualSchema).length(10), monthly: z.array(monthlySchema).length(12),
});
export interface ClimateCell {
  dataset: "chirps_v3" | "era5_land_cds"; grid_version: string; cell_id: string;
  west: number; east: number; south: number; north: number; center_latitude: number; center_longitude: number;
  payload: unknown; imported_at: string;
}

/** Actual half-open source raster bounds. Multiple versions/cells are ambiguous, not a nearest-cell guess. */
export function selectCell(cells: ClimateCell[], dataset: ClimateCell["dataset"], latitude: number, longitude: number): ClimateCell | null {
  const matching = cells.filter((c) => c.dataset === dataset && longitude >= c.west && longitude < c.east && latitude >= c.south && latitude < c.north);
  return matching.length === 1 ? matching[0] ?? null : null;
}

export function combineCells(cells: ClimateCell[], latitude: number, longitude: number): HistoricalWeatherResult {
  const datasets = ["chirps_v3", "era5_land_cds"] as const;
  const groups = datasets.map((dataset) => {
    const cell = selectCell(cells, dataset, latitude, longitude);
    const parsed = cellPayloadSchema.safeParse(cell?.payload);
    if (!cell || !parsed.success || parsed.data.source.model !== dataset || !["success", "partial"].includes(parsed.data.source.status)) return null;
    const p = parsed.data;
    if (new Set(p.annual.map((a) => a.year)).size !== 10 || new Set(p.monthly.map((m) => m.month)).size !== 12) return null;
    const source: SourceMeta = { ...p.source, returned: { latitude: cell.center_latitude, longitude: cell.center_longitude, elevation_m: null }, timezone: "UTC", errors: [],
      grid_cell: { id: cell.cell_id, version: cell.grid_version, west: cell.west, east: cell.east, south: cell.south, north: cell.north } };
    return { ...p, source };
  });
  const [rain, temp] = groups;
  const warnings = datasets.flatMap((d, i) => groups[i] ? [] : [`${d}: prepared 2016–2025 data has not been imported or cannot be verified for this source cell.`]);
  const sources: SourceMeta[] = datasets.map((d, i) => groups[i]?.source ?? {
    model: d, dataset: d === "chirps_v3" ? "CHIRPS v3 / Climate Hazards Center" : "Copernicus ERA5-Land / ECMWF",
    spatial_resolution: d === "chirps_v3" ? "0.05° (target; cell not imported)" : "0.1° (target; cell not imported)",
    variables: d === "chirps_v3" ? ["precipitation_sum"] : ["temperature_2m_mean", "temperature_2m_min", "temperature_2m_max"],
    returned: { latitude: null, longitude: null, elevation_m: null }, timezone: "UTC", status: "no_data", errors: [warnings.find((w) => w.startsWith(d)) ?? "Not imported"],
  });
  const emptyCounts = { temperature_2m_mean: 0, temperature_2m_min: 0, temperature_2m_max: 0, precipitation_sum: 0, rain_sum: 0, et0_fao_evapotranspiration: 0 };
  const annual = Array.from({ length: 10 }, (_, i) => {
    const year = 2016 + i, p = rain?.annual.find((a) => a.year === year), t = temp?.annual.find((a) => a.year === year);
    return { year, days_in_year: year % 4 === 0 ? 366 : 365, precipitation_total_mm: p?.precipitation_total_mm ?? null,
      temperature_mean_c: t?.temperature_mean_c ?? null, temperature_min_avg_c: t?.temperature_min_avg_c ?? null, temperature_max_avg_c: t?.temperature_max_avg_c ?? null,
      rain_total_mm: null, et0_total_mm: null, ...(p?.valid_months ? { valid_months: p.valid_months } : {}), valid_days: { ...emptyCounts, precipitation_sum: p?.valid_days.precipitation_sum ?? 0,
        temperature_2m_mean: t?.valid_days.temperature_2m_mean ?? 0, temperature_2m_min: t?.valid_days.temperature_2m_min ?? 0, temperature_2m_max: t?.valid_days.temperature_2m_max ?? 0 },
      reliable: !!p && !!t && p.precipitation_total_mm !== null && t.temperature_mean_c !== null, flags: [...(p?.flags ?? []), ...(t?.flags ?? [])] };
  });
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1, p = rain?.monthly.find((m) => m.month === month), t = temp?.monthly.find((m) => m.month === month);
    return { month, precipitation_avg_total_mm: p?.precipitation_avg_total_mm ?? null, temperature_mean_avg_c: t?.temperature_mean_avg_c ?? null,
      temperature_min_avg_c: t?.temperature_min_avg_c ?? null, temperature_max_avg_c: t?.temperature_max_avg_c ?? null,
      rain_avg_total_mm: null, et0_avg_total_mm: null, valid_years: { ...emptyCounts, precipitation_sum: p?.valid_years.precipitation_sum ?? 0,
        temperature_2m_mean: t?.valid_years.temperature_2m_mean ?? 0, temperature_2m_min: t?.valid_years.temperature_2m_min ?? 0, temperature_2m_max: t?.valid_years.temperature_2m_max ?? 0 } };
  });
  const average = (values: (number | null)[]) => { const v = values.filter((n): n is number => n !== null); return v.length >= 8 ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  return {
    source: "CHIRPS v3 / Climate Hazards Center + Copernicus ERA5-Land / ECMWF", dataset: "Prepared Uzbekistan historical climate", model: "chirps_v3+era5_land_cds",
    requested: { latitude, longitude }, returned: sources[1]?.returned ?? { latitude: null, longitude: null, elevation_m: null }, sources, timezone: "UTC",
    start_date: BASELINE_START, end_date: BASELINE_END, resolution: "Source-specific grid cells; annual summaries and monthly climatology", annual, monthly,
    summary: rain || temp ? { avg_annual_precipitation_mm: average(annual.map((a) => a.precipitation_total_mm)), avg_annual_mean_temperature_c: average(annual.map((a) => a.temperature_mean_c)),
      avg_annual_rain_mm: null, avg_annual_et0_mm: null, wettest_year: null, driest_year: null, wettest_month: null, driest_month: null, notes: warnings } : null,
    status: rain || temp ? "partial" : "no_data", error_kind: rain || temp ? null : "no_data", errors: warnings, warnings,
    note: "Gridded estimates, not direct field measurements. CHIRPS and ERA5-Land retain separate source cells. Rain-only and ET0 are not supplied by this import.",
    fetched_at: new Date().toISOString(), diagnostics: { provider_requests: 0, cache: { chirps_v3: rain ? "hit" : "miss", era5_land_cds: temp ? "hit" : "miss" } },
  };
}