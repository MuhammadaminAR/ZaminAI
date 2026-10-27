/**
 * Historical weather provider layer (Open-Meteo Historical Weather API, ERA5-Land).
 * Isolated so the provider can be swapped (e.g. commercial Open-Meteo plan) without
 * changing the response shape. Free endpoint is non-commercial only.
 * Env overrides: OPEN_METEO_ARCHIVE_BASE_URL, OPEN_METEO_API_KEY.
 */
import { isCoolingDown, type CooldownStore } from "./provider-cooldown";

const TIMEOUT_MS = 30000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const HIST_START = "2016-01-01";
export const HIST_END = "2025-12-31";
export const HIST_MODEL = "era5_land";
/** Minimum share of valid days for a period summary to be considered reliable. */
const MIN_COVERAGE = 0.9;

const DAILY_VARS = [
  "temperature_2m_mean", "temperature_2m_max", "temperature_2m_min",
  "precipitation_sum", "rain_sum", "et0_fao_evapotranspiration",
] as const;
type Var = (typeof DAILY_VARS)[number];

export interface DailySeries {
  time: string[];
  values: Record<Var, (number | null)[]>;
}

export interface AnnualSummary {
  year: number;
  precipitation_total_mm: number | null;
  rain_total_mm: number | null;
  temperature_mean_c: number | null;
  temperature_min_avg_c: number | null;
  temperature_max_avg_c: number | null;
  et0_total_mm: number | null;
  days_in_year: number;
  valid_days: Record<Var, number>;
  reliable: boolean;
  flags: string[];
}

export interface MonthlyClimate {
  month: number;
  precipitation_avg_total_mm: number | null;
  rain_avg_total_mm: number | null;
  temperature_mean_avg_c: number | null;
  temperature_min_avg_c: number | null;
  temperature_max_avg_c: number | null;
  et0_avg_total_mm: number | null;
  valid_years: Record<Var, number>;
}

export interface LongTermSummary {
  avg_annual_precipitation_mm: number | null;
  avg_annual_rain_mm: number | null;
  avg_annual_mean_temperature_c: number | null;
  avg_annual_et0_mm: number | null;
  wettest_year: { year: number; precipitation_mm: number } | null;
  driest_year: { year: number; precipitation_mm: number } | null;
  wettest_month: { month: number; precipitation_avg_mm: number } | null;
  driest_month: { month: number; precipitation_avg_mm: number } | null;
  notes: string[];
}

export interface SourceMeta {
  model: "era5_land" | "era5" | "chirps_v3" | "era5_land_cds";
  dataset: string;
  spatial_resolution: string;
  variables: string[];
  returned: { latitude: number | null; longitude: number | null; elevation_m: number | null };
  timezone: string;
  status: "success" | "partial" | "no_data" | "error";
  errors: string[];
  grid_cell?: { id: string; version: string; west: number; east: number; south: number; north: number };
  period?: { start: string; end: string };
  attribution_url?: string;
  licence?: string;
}

export type HistoricalStatus = "success" | "partial" | "no_data" | "error";
export type HistoricalErrorKind = "provider_error" | "rate_limited" | "timeout" | "no_data" | null;

export interface HistoricalWeatherResult {
  source: "Open-Meteo" | "CHIRPS v3 / Climate Hazards Center + Copernicus ERA5-Land / ECMWF";
  dataset: string;
  model: string;
  requested: { latitude: number; longitude: number };
  returned: { latitude: number | null; longitude: number | null; elevation_m: number | null };
  sources: SourceMeta[];
  timezone: string;
  start_date: string;
  end_date: string;
  resolution: string;
  annual: AnnualSummary[];
  monthly: MonthlyClimate[];
  summary: LongTermSummary | null;
  status: HistoricalStatus;
  error_kind: HistoricalErrorKind;
  errors: string[];
  warnings: string[];
  note: string;
  fetched_at: string;
  /** When rate-limited: earliest time a fresh provider request will be attempted. */
  retry_after?: string | null;
  /** Per-lookup request accounting (provider HTTP requests actually sent, cache use per dataset). */
  diagnostics?: { provider_requests: number; cache: Record<string, "hit" | "miss" | "skipped_cooldown"> };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v: number | null, d = 1) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const emptyCounts = (): Record<Var, number> =>
  Object.fromEntries(DAILY_VARS.map((v) => [v, 0])) as Record<Var, number>;

const SUM_VARS: Var[] = ["precipitation_sum", "rain_sum", "et0_fao_evapotranspiration"];

/** Pure aggregation of daily data — exported for tests. Missing values are skipped, never zeroed. */
export function aggregate(series: DailySeries, startYear = 2016, endYear = 2025) {
  // bucket[year][month][var] = valid values
  const bucket = new Map<number, Map<number, Record<Var, number[]>>>();
  series.time.forEach((date, i) => {
    const y = Number(date.slice(0, 4));
    const m = Number(date.slice(5, 7));
    if (y < startYear || y > endYear) return;
    if (!bucket.has(y)) bucket.set(y, new Map());
    const ym = bucket.get(y)!;
    if (!ym.has(m)) ym.set(m, Object.fromEntries(DAILY_VARS.map((v) => [v, []])) as unknown as Record<Var, number[]>);
    const rec = ym.get(m)!;
    for (const v of DAILY_VARS) {
      const x = num(series.values[v]?.[i]);
      if (x !== null) rec[v].push(x);
    }
  });

  const annual: AnnualSummary[] = [];
  // monthTotals[month][var] = per-year values (totals for sums, means for temps), only reliable months
  const monthVals = new Map<number, Record<Var, number[]>>();
  for (let m = 1; m <= 12; m++) monthVals.set(m, Object.fromEntries(DAILY_VARS.map((v) => [v, []])) as unknown as Record<Var, number[]>);

  for (let y = startYear; y <= endYear; y++) {
    const ym = bucket.get(y);
    const diy = isLeap(y) ? 366 : 365;
    const valid = emptyCounts();
    const all = Object.fromEntries(DAILY_VARS.map((v) => [v, [] as number[]])) as Record<Var, number[]>;
    for (let m = 1; m <= 12; m++) {
      const rec = ym?.get(m);
      if (!rec) continue;
      const dim = daysInMonth(y, m);
      for (const v of DAILY_VARS) {
        all[v].push(...rec[v]);
        valid[v] += rec[v].length;
        if (rec[v].length >= dim * MIN_COVERAGE) {
          const val = SUM_VARS.includes(v) ? rec[v].reduce((a, b) => a + b, 0) : mean(rec[v])!;
          monthVals.get(m)![v].push(val);
        }
      }
    }
    const flags: string[] = [];
    const ok = (v: Var) => valid[v] >= diy * MIN_COVERAGE;
    for (const v of DAILY_VARS) {
      if (!ok(v)) flags.push(`${v}: only ${valid[v]} of ${diy} days valid`);
    }
    const total = (v: Var) => (ok(v) ? round(all[v].reduce((a, b) => a + b, 0)) : null);
    const avg = (v: Var) => (ok(v) ? round(mean(all[v])) : null);
    annual.push({
      year: y,
      precipitation_total_mm: total("precipitation_sum"),
      rain_total_mm: total("rain_sum"),
      temperature_mean_c: avg("temperature_2m_mean"),
      temperature_min_avg_c: avg("temperature_2m_min"),
      temperature_max_avg_c: avg("temperature_2m_max"),
      et0_total_mm: total("et0_fao_evapotranspiration"),
      days_in_year: diy,
      valid_days: valid,
      reliable: flags.length === 0,
      flags,
    });
  }

  const monthly: MonthlyClimate[] = [];
  for (let m = 1; m <= 12; m++) {
    const r = monthVals.get(m)!;
    const valid_years = Object.fromEntries(DAILY_VARS.map((v) => [v, r[v].length])) as Record<Var, number>;
    const a = (v: Var) => round(mean(r[v]));
    monthly.push({
      month: m,
      precipitation_avg_total_mm: a("precipitation_sum"),
      rain_avg_total_mm: a("rain_sum"),
      temperature_mean_avg_c: a("temperature_2m_mean"),
      temperature_min_avg_c: a("temperature_2m_min"),
      temperature_max_avg_c: a("temperature_2m_max"),
      et0_avg_total_mm: a("et0_fao_evapotranspiration"),
      valid_years,
    });
  }

  const notes: string[] = [];
  const years = endYear - startYear + 1;
  const minYears = Math.ceil(years * 0.8);
  const longAvg = (pick: (a: AnnualSummary) => number | null, label: string) => {
    const xs = annual.map(pick).filter((x): x is number => x !== null);
    if (xs.length < minYears) {
      notes.push(`${label}: only ${xs.length} of ${years} years have reliable data.`);
      return null;
    }
    return round(mean(xs));
  };
  const precipYears = annual.filter((a) => a.precipitation_total_mm !== null);
  const allPrecipYears = precipYears.length === years;
  if (!allPrecipYears) notes.push("Wettest/driest year unavailable: not all years have reliable precipitation.");
  const sortedY = [...precipYears].sort((a, b) => a.precipitation_total_mm! - b.precipitation_total_mm!);
  const monthsP = monthly.filter((m) => m.precipitation_avg_total_mm !== null && m.valid_years.precipitation_sum >= minYears);
  const allMonths = monthsP.length === 12;
  if (!allMonths) notes.push("Wettest/driest month unavailable: not all 12 months have enough valid years.");
  const sortedM = [...monthsP].sort((a, b) => a.precipitation_avg_total_mm! - b.precipitation_avg_total_mm!);

  const summary: LongTermSummary = {
    avg_annual_precipitation_mm: longAvg((a) => a.precipitation_total_mm, "Average annual precipitation"),
    avg_annual_rain_mm: longAvg((a) => a.rain_total_mm, "Average annual rain"),
    avg_annual_mean_temperature_c: longAvg((a) => a.temperature_mean_c, "Average annual temperature"),
    avg_annual_et0_mm: longAvg((a) => a.et0_total_mm, "Average annual ET0"),
    wettest_year: allPrecipYears ? { year: sortedY.at(-1)!.year, precipitation_mm: sortedY.at(-1)!.precipitation_total_mm! } : null,
    driest_year: allPrecipYears ? { year: sortedY[0]!.year, precipitation_mm: sortedY[0]!.precipitation_total_mm! } : null,
    wettest_month: allMonths ? { month: sortedM.at(-1)!.month, precipitation_avg_mm: sortedM.at(-1)!.precipitation_avg_total_mm! } : null,
    driest_month: allMonths ? { month: sortedM[0]!.month, precipitation_avg_mm: sortedM[0]!.precipitation_avg_total_mm! } : null,
    notes,
  };
  return { annual, monthly, summary };
}

/** Bump when the requested variables/period/aggregation change so old cache rows are not reused. */
export const HIST_DATA_VERSION = "v1";
/** The 2016–2025 period is closed; a successful dataset response is reused for 30 days. */
export const HIST_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ARCHIVE_PROVIDER = "open-meteo-archive" as const;

const memCache = new Map<string, { at: number; value: HistoricalWeatherResult }>();

/** Variable groups per dataset. ERA5-Land has no precipitation; ERA5 supplies it (coarser grid). */
const GROUPS = [
  { model: "era5_land" as const, dataset: "ERA5-Land reanalysis (ECMWF Copernicus)", spatial_resolution: "~11 km (0.1°)",
    variables: ["temperature_2m_mean", "temperature_2m_max", "temperature_2m_min", "et0_fao_evapotranspiration"] as Var[] },
  { model: "era5" as const, dataset: "ERA5 reanalysis (ECMWF Copernicus)", spatial_resolution: "~25 km (0.25°)",
    variables: ["precipitation_sum", "rain_sum"] as Var[] },
];

export interface CachedGroup { meta: SourceMeta; time: string[]; daily: Record<string, unknown[]>; fetched_at: string }
export interface HistCacheKey { model: "era5_land" | "era5"; dataVersion: string; latitude: number; longitude: number; start: string; end: string }
/** Exact-coordinate cache of successful per-dataset responses (no rounding, no cross-location sharing). */
export interface HistCacheStore {
  get(key: HistCacheKey): Promise<CachedGroup | null>;
  put(key: HistCacheKey, group: CachedGroup): Promise<void>;
}
export interface HistDeps { cache: HistCacheStore; cooldown: CooldownStore; now?: () => Date }

type Fetched = { meta: SourceMeta; time: string[]; daily: Record<string, unknown[]>; errorKind: HistoricalErrorKind; retryAfter?: string | null };

async function fetchGroup(latitude: number, longitude: number, g: (typeof GROUPS)[number], cooldown: CooldownStore): Promise<Fetched> {
  const meta: SourceMeta = { model: g.model, dataset: g.dataset, spatial_resolution: g.spatial_resolution, variables: g.variables,
    returned: { latitude: null, longitude: null, elevation_m: null }, timezone: "", status: "error", errors: [] };
  const params = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude), start_date: HIST_START, end_date: HIST_END,
    daily: g.variables.join(","), models: g.model, timezone: "auto", temperature_unit: "celsius", precipitation_unit: "mm",
  });
  const key = process.env["OPEN_METEO_API_KEY"];
  if (key) params.set("apikey", key);
  const base = process.env["OPEN_METEO_ARCHIVE_BASE_URL"] || "https://archive-api.open-meteo.com";
  const url = `${base}/v1/archive?${params}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let reason = "";
      try { reason = JSON.parse(body).reason ?? ""; } catch { /* ignore */ }
      if (res.status === 429) {
        // Provider rate limit: never retried here, never treated as "no data", never cached as data.
        const rec = await cooldown.record429(ARCHIVE_PROVIDER, {
          status: 429, reason: reason || null, endpoint: `${base}/v1/archive`, dataset: g.model, retryAfter: res.headers.get("retry-after"),
        }).catch(() => null);
        console.error("Open-Meteo archive HTTP 429", JSON.stringify({ dataset: g.model, at: new Date().toISOString(), reason, cooldown_until: rec?.cooldown_until }));
        meta.errors.push(`${g.model}: provider rate limit reached (HTTP 429).`);
        return { meta, time: [], daily: {}, errorKind: "rate_limited", retryAfter: rec?.cooldown_until ?? null };
      }
      console.error("Open-Meteo archive HTTP", g.model, res.status, body.slice(0, 300));
      meta.errors.push(`${g.model}: provider error (HTTP ${res.status})${reason ? `: ${reason}` : ""}.`);
      return { meta, time: [], daily: {}, errorKind: "provider_error" };
    }
    const json: any = await res.json();
    const d = json?.daily ?? {};
    meta.returned = { latitude: num(json?.latitude), longitude: num(json?.longitude), elevation_m: num(json?.elevation) };
    meta.timezone = typeof json?.timezone === "string" ? json.timezone : "";
    const time: string[] = Array.isArray(d.time) ? d.time : [];
    let populated = 0;
    for (const v of g.variables) {
      const arr = Array.isArray(d[v]) ? d[v] : null;
      const n = arr ? arr.filter((x: unknown) => num(x) !== null).length : 0;
      if (!arr) meta.errors.push(`${v}: not returned by provider.`);
      else if (n === 0) meta.errors.push(
        v === "et0_fao_evapotranspiration" && g.model === "era5_land"
          ? `${v}: provider returned all nulls for ERA5-Land (its radiation/wind inputs are null on this endpoint); not substituted.`
          : `${v}: provider returned all nulls.`);
      else populated++;
    }
    meta.status = populated === 0 ? "no_data" : populated < g.variables.length ? "partial" : "success";
    const daily: Record<string, unknown[]> = {};
    for (const v of g.variables) if (Array.isArray(d[v])) daily[v] = d[v];
    return { meta, time, daily, errorKind: populated === 0 ? "no_data" : null };
  } catch (e) {
    console.error("Open-Meteo archive request failed", g.model, e);
    const timeout = e instanceof Error && e.name === "TimeoutError";
    meta.errors.push(`${g.model}: ${timeout ? "timed out" : "temporarily unavailable"}.`);
    return { meta, time: [], daily: {}, errorKind: timeout ? "timeout" : "provider_error" };
  }
}

async function defaultDeps(): Promise<HistDeps> {
  const { dbHistCacheStore, dbCooldownStore } = await import("./weather-cache.server");
  return { cache: dbHistCacheStore(), cooldown: dbCooldownStore() };
}

export async function getHistoricalWeather(latitude: number, longitude: number, depsIn?: HistDeps): Promise<HistoricalWeatherResult> {
  // Exact coordinates + date range + models form the cache identity (no rounding).
  const memKey = `${latitude},${longitude},${HIST_START},${HIST_END},era5_land+era5,${HIST_DATA_VERSION}`;
  const hit = memCache.get(memKey);
  if (!depsIn && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const deps = depsIn ?? (await defaultDeps());
  const now = deps.now ?? (() => new Date());
  const cacheState: Record<string, "hit" | "miss" | "skipped_cooldown"> = {};
  let providerRequests = 0;

  // 1. Reuse saved successful dataset responses (30 days) — only missing datasets are fetched.
  const keyFor = (g: (typeof GROUPS)[number]): HistCacheKey =>
    ({ model: g.model, dataVersion: HIST_DATA_VERSION, latitude, longitude, start: HIST_START, end: HIST_END });
  const cached = await Promise.all(GROUPS.map(async (g) => {
    const c = await deps.cache.get(keyFor(g)).catch(() => null);
    return c && now().getTime() - new Date(c.fetched_at).getTime() < HIST_CACHE_TTL_MS ? c : null;
  }));

  // 2. Respect an active provider cooldown: no request is sent while it lasts.
  const needFetch = GROUPS.some((_, i) => !cached[i]);
  const cd = needFetch ? await deps.cooldown.get(ARCHIVE_PROVIDER).catch(() => null) : null;
  const coolingDown = isCoolingDown(cd, now());

  const results: Fetched[] = await Promise.all(GROUPS.map(async (g, i): Promise<Fetched> => {
    const c = cached[i];
    if (c) { cacheState[g.model] = "hit"; return { meta: c.meta, time: c.time, daily: c.daily, errorKind: null }; }
    if (coolingDown) {
      cacheState[g.model] = "skipped_cooldown";
      return { meta: { model: g.model, dataset: g.dataset, spatial_resolution: g.spatial_resolution, variables: g.variables,
        returned: { latitude: null, longitude: null, elevation_m: null }, timezone: "", status: "error",
        errors: [`${g.model}: provider rate limit cooldown active; request not sent.`] },
        time: [], daily: {}, errorKind: "rate_limited", retryAfter: cd!.cooldown_until };
    }
    cacheState[g.model] = "miss";
    providerRequests++;
    const r = await fetchGroup(latitude, longitude, g, deps.cooldown);
    if (r.meta.status === "success" || r.meta.status === "partial") {
      await deps.cache.put(keyFor(g), { meta: r.meta, time: r.time, daily: r.daily, fetched_at: now().toISOString() }).catch(() => undefined);
    }
    return r;
  }));
  // A successful request after an expired cooldown resets the backoff streak.
  if (cd && !coolingDown && providerRequests > 0 && results.every((r) => r.errorKind !== "rate_limited")) {
    await deps.cooldown.clear(ARCHIVE_PROVIDER).catch(() => undefined);
  }
  console.info("historical-weather lookup", JSON.stringify({ provider_requests: providerRequests, cache: cacheState }));

  const land = results[0]!;
  const sources = results.map((r) => r.meta);
  const errors = sources.flatMap((s) => s.errors);
  const retryAfter = results.map((r) => r.retryAfter).find(Boolean) ?? null;

  const base: HistoricalWeatherResult = {
    source: "Open-Meteo",
    dataset: "Open-Meteo Historical Weather API — ERA5-Land (temperature, ET0) + ERA5 (precipitation, rain)",
    model: "era5_land+era5",
    requested: { latitude, longitude },
    returned: land.meta.returned,
    sources,
    timezone: land.meta.timezone || results[1]!.meta.timezone,
    start_date: HIST_START, end_date: HIST_END,
    resolution: "Daily values (ERA5-Land ~11 km, ERA5 ~25 km), summarised to annual totals/means and a 12-month climatology",
    annual: [], monthly: [], summary: null,
    status: "error", error_kind: null, errors, warnings: [],
    note: "Historical reanalysis estimates for the grid cells containing these coordinates — not measurements from the farmer's field or from a nearby weather station. Temperature/ET0 and precipitation come from different datasets with different grid sizes.",
    fetched_at: now().toISOString(),
    retry_after: retryAfter,
    diagnostics: { provider_requests: providerRequests, cache: cacheState },
  };

  if (results.every((r) => r.meta.status === "error" || r.meta.status === "no_data")) {
    const kinds = results.map((r) => r.errorKind);
    const kind: HistoricalErrorKind = kinds.includes("rate_limited") ? "rate_limited"
      : kinds.find((k) => k && k !== "no_data") ?? "no_data";
    return { ...base, status: kind === "no_data" ? "no_data" : "error", error_kind: kind };
  }

  // Merge both sources by date; never by array position.
  const dates = new Set<string>();
  results.forEach((r) => r.time.forEach((t) => dates.add(t)));
  const time = [...dates].sort();
  const values = Object.fromEntries(DAILY_VARS.map((v) => [v, [] as (number | null)[]])) as DailySeries["values"];
  for (const [gi, g] of GROUPS.entries()) {
    const r = results[gi]!;
    const idx = new Map(r.time.map((t, i) => [t, i]));
    for (const v of g.variables) {
      const arr = Array.isArray(r.daily[v]) ? r.daily[v] : [];
      values[v] = time.map((t) => (idx.has(t) ? num(arr[idx.get(t)!]) : null));
    }
  }

  const { annual, monthly, summary } = aggregate({ time, values });
  const warnings: string[] = [];
  const unreliable = annual.filter((a) => !a.reliable);
  if (unreliable.length) warnings.push(`${unreliable.length} year(s) have at least one metric with insufficient data (see flags).`);
  warnings.push(...summary.notes);
  const complete = sources.every((s) => s.status === "success") && !warnings.length;
  const anyGroupFailed = sources.some((s) => s.status === "error");
  const value: HistoricalWeatherResult = {
    ...base, annual, monthly, summary, warnings, status: complete ? "success" : "partial",
    error_kind: anyGroupFailed ? (results.find((r) => r.meta.status === "error")?.errorKind ?? null) : null,
  };
  // Memory cache only holds results where every dataset delivered data (provider-side nulls are a stable answer).
  if (!anyGroupFailed) memCache.set(memKey, { at: Date.now(), value });
  return value;
}
