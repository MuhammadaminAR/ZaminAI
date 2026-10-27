/**
 * Weather provider layer. Open-Meteo is the initial provider; the free endpoint
 * is non-commercial, so the base URL / API key are swappable via env
 * (OPEN_METEO_BASE_URL, OPEN_METEO_API_KEY) for the commercial customer API
 * without changing the response shape the frontend consumes.
 */
import { isCoolingDown, type CooldownStore } from "./provider-cooldown";

const TIMEOUT_MS = 15000;
const FORECAST_PROVIDER = "open-meteo-forecast" as const;
const CACHE_TTL_MS = 30 * 60 * 1000;
const FORECAST_DAYS = 7;

export interface WeatherCurrent {
  temperature_c: number | null;
  relative_humidity_percent: number | null;
  precipitation_mm: number | null;
  rain_mm: number | null;
  wind_speed_kmh: number | null;
  weather_code: number | null;
}
export interface WeatherForecastDay {
  date: string;
  temperature_min_c: number | null;
  temperature_max_c: number | null;
  precipitation_mm: number | null;
  rain_mm: number | null;
  precipitation_probability_percent: number | null;
  et0_mm: number | null;
}
export interface WeatherResult {
  source: "Open-Meteo";
  latitude: number;
  longitude: number;
  timezone: string;
  current: WeatherCurrent;
  forecast: WeatherForecastDay[];
  status: "success" | "partial" | "error";
  errors: string[];
  error_kind?: "rate_limited" | "provider_error" | "timeout" | null;
  /** When rate-limited: earliest time a fresh provider request will be attempted. */
  retry_after?: string | null;
  /** Whether this response came from the 30-minute success cache and how many provider requests were sent. */
  diagnostics?: { cache: "hit" | "miss" | "skipped_cooldown"; provider_requests: number };
}

const CURRENT_VARS = ["temperature_2m", "relative_humidity_2m", "precipitation", "rain", "wind_speed_10m", "weather_code"];
const DAILY_VARS = [
  "temperature_2m_min", "temperature_2m_max", "precipitation_sum", "rain_sum",
  "precipitation_probability_max", "et0_fao_evapotranspiration",
];

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const cache = new Map<string, { at: number; value: WeatherResult }>();

function emptyCurrent(): WeatherCurrent {
  return { temperature_c: null, relative_humidity_percent: null, precipitation_mm: null, rain_mm: null, wind_speed_kmh: null, weather_code: null };
}

function providerUrl(path: string, params: URLSearchParams) {
  const base = process.env["OPEN_METEO_BASE_URL"] || "https://api.open-meteo.com";
  const key = process.env["OPEN_METEO_API_KEY"];
  if (key) params.set("apikey", key);
  return `${base}${path}?${params.toString()}`;
}

/** Current conditions + 7-day forecast for exact coordinates. */
export async function getWeather(latitude: number, longitude: number, deps?: { cooldown: CooldownStore }): Promise<WeatherResult> {
  const day = new Date().toISOString().slice(0, 10);
  // Exact coordinates: a cached result must echo the very point requested.
  const cacheKey = `${latitude},${longitude},${day}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.value, diagnostics: { cache: "hit", provider_requests: 0 } };

  const base: WeatherResult = {
    source: "Open-Meteo", latitude, longitude, timezone: "", current: emptyCurrent(),
    forecast: [], status: "error", errors: [],
  };
  const params = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude),
    current: CURRENT_VARS.join(","), daily: DAILY_VARS.join(","),
    forecast_days: String(FORECAST_DAYS), timezone: "auto",
    temperature_unit: "celsius", wind_speed_unit: "kmh", precipitation_unit: "mm",
  });

  const cooldown = deps?.cooldown ?? (await import("./weather-cache.server")).dbCooldownStore();
  // An active provider rate-limit cooldown means no request is sent at all.
  const cd = await cooldown.get(FORECAST_PROVIDER).catch(() => null);
  if (isCoolingDown(cd)) {
    return { ...base, errors: ["Weather provider rate limit cooldown active; request not sent."], error_kind: "rate_limited",
      retry_after: cd!.cooldown_until, diagnostics: { cache: "skipped_cooldown", provider_requests: 0 } };
  }
  const diagnostics = { cache: "miss" as const, provider_requests: 1 };

  let json: { current?: any; daily?: any; timezone?: unknown };
  try {
    const res = await fetch(providerUrl("/v1/forecast", params), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) {
        let reason: string | null = null;
        try { reason = JSON.parse(body).reason ?? null; } catch { /* ignore */ }
        const base_url = process.env["OPEN_METEO_BASE_URL"] || "https://api.open-meteo.com";
        const rec = await cooldown.record429(FORECAST_PROVIDER, {
          status: 429, reason, endpoint: `${base_url}/v1/forecast`, dataset: "forecast", retryAfter: res.headers.get("retry-after"),
        }).catch(() => null);
        console.error("Open-Meteo HTTP 429", JSON.stringify({ endpoint: "forecast", at: new Date().toISOString(), reason, cooldown_until: rec?.cooldown_until }));
        return { ...base, errors: ["Weather provider rate limit reached (HTTP 429)."], error_kind: "rate_limited",
          retry_after: rec?.cooldown_until ?? null, diagnostics };
      }
      console.error("Open-Meteo HTTP", res.status, body.slice(0, 300));
      return { ...base, errors: ["Weather service is temporarily unavailable."], error_kind: "provider_error", diagnostics };
    }
    json = await res.json();
  } catch (e) {
    console.error("Open-Meteo request failed", e);
    const timeout = e instanceof Error && e.name === "TimeoutError";
    return { ...base, errors: [timeout ? "Weather service timed out." : "Weather service is temporarily unavailable."],
      error_kind: timeout ? "timeout" : "provider_error", diagnostics };
  }
  if (cd) await cooldown.clear(FORECAST_PROVIDER).catch(() => undefined);

  const errors: string[] = [];
  const c = json.current ?? {};
  const current: WeatherCurrent = {
    temperature_c: num(c.temperature_2m),
    relative_humidity_percent: num(c.relative_humidity_2m),
    precipitation_mm: num(c.precipitation),
    rain_mm: num(c.rain),
    wind_speed_kmh: num(c.wind_speed_10m),
    weather_code: num(c.weather_code),
  };
  if (!json.current) errors.push("Current weather unavailable.");

  const d = json.daily ?? {};
  const dates: string[] = Array.isArray(d.time) ? d.time : [];
  const at = (k: string, i: number) => num(Array.isArray(d[k]) ? d[k][i] : null);
  const forecast = dates.map((date, i) => ({
    date,
    temperature_min_c: at("temperature_2m_min", i),
    temperature_max_c: at("temperature_2m_max", i),
    precipitation_mm: at("precipitation_sum", i),
    rain_mm: at("rain_sum", i),
    precipitation_probability_percent: at("precipitation_probability_max", i),
    et0_mm: at("et0_fao_evapotranspiration", i),
  }));
  if (forecast.length < FORECAST_DAYS) errors.push(`Forecast returned ${forecast.length} of ${FORECAST_DAYS} days.`);

  const hasCurrent = Object.values(current).some((v) => v !== null);
  const status: WeatherResult["status"] =
    !hasCurrent && forecast.length === 0 ? "error" : errors.length ? "partial" : "success";

  // Echo the requested coordinates: Open-Meteo snaps to its grid cell, but the farmer's point is the source of truth.
  const value: WeatherResult = {
    ...base, timezone: typeof json.timezone === "string" ? json.timezone : "", current, forecast, status, errors,
    error_kind: null, retry_after: null, diagnostics,
  };
  if (status === "success") cache.set(cacheKey, { at: Date.now(), value });
  return value;
}

/**
 * Historical weather — separate from the forecast on purpose.
 * Planned: Open-Meteo archive API (/v1/archive) for rainfall totals,
 * monthly precipitation, average temperature and trends.
 */
export interface HistoricalWeatherRequest {
  latitude: number;
  longitude: number;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  aggregation: "daily" | "monthly";
}
export async function getHistoricalWeather(_req: HistoricalWeatherRequest): Promise<never> {
  throw new Error("Historical weather is not implemented yet.");
}
