/**
 * Pure provider rate-limit (HTTP 429) cooldown rules, shared by the current-weather
 * and historical-weather services. A 429 starts an explicit cooldown with bounded
 * exponential backoff so no further provider requests are sent during it.
 */
export const COOLDOWN_BASE_MINUTES = 15;
export const COOLDOWN_MAX_MINUTES = 360;
/** A 429 more than this long after the previous one starts the backoff again. */
const STREAK_WINDOW_MS = 24 * 60 * 60 * 1000;
const SAME_EVENT_MS = 60 * 1000;

export const RATE_LIMIT_MESSAGE =
  "Weather data is temporarily rate-limited. Previously saved data remains available; please try again later.";

export type WeatherProvider = "open-meteo-forecast" | "open-meteo-archive";

export interface CooldownRecord {
  provider: string;
  cooldown_until: string;
  consecutive_429: number;
  recorded_at: string;
  last_status: number;
  last_reason: string | null;
  endpoint: string | null;
  dataset: string | null;
}

export function isCoolingDown(rec: CooldownRecord | null, now: Date = new Date()): boolean {
  return !!rec && new Date(rec.cooldown_until).getTime() > now.getTime();
}

/** Parses a Retry-After header (seconds or HTTP date) to milliseconds from now; null when absent/invalid. */
export function parseRetryAfter(header: string | null | undefined, now: Date = new Date()): number | null {
  if (!header) return null;
  const s = header.trim();
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.max(0, t - now.getTime()) : null;
}

/** Next cooldown after a 429: 15, 30, 60, 120, 240, then capped at 360 minutes; a longer Retry-After (≤ cap) wins. */
export function nextCooldown(prev: CooldownRecord | null, now: Date, retryAfterHeader: string | null): { until: Date; consecutive: number } {
  // Parallel requests of one lookup (e.g. ERA5 + ERA5-Land) that both hit 429 count as one event.
  if (prev && now.getTime() - new Date(prev.recorded_at).getTime() < SAME_EVENT_MS) {
    return { until: new Date(prev.cooldown_until), consecutive: prev.consecutive_429 };
  }
  const recent = prev && now.getTime() - new Date(prev.recorded_at).getTime() < STREAK_WINDOW_MS;
  const consecutive = recent ? prev.consecutive_429 + 1 : 1;
  const backoffMs = Math.min(COOLDOWN_BASE_MINUTES * 2 ** (consecutive - 1), COOLDOWN_MAX_MINUTES) * 60_000;
  const retryAfter = parseRetryAfter(retryAfterHeader, now);
  const ms = retryAfter === null ? backoffMs : Math.max(backoffMs, Math.min(retryAfter, COOLDOWN_MAX_MINUTES * 60_000));
  return { until: new Date(now.getTime() + ms), consecutive };
}

/** Storage for cooldowns; the server implementation persists them so every server instance respects them. */
export interface CooldownStore {
  get(provider: WeatherProvider): Promise<CooldownRecord | null>;
  record429(provider: WeatherProvider, info: { status: number; reason: string | null; endpoint: string; dataset: string | null; retryAfter: string | null }): Promise<CooldownRecord>;
  clear(provider: WeatherProvider): Promise<void>;
}

/** In-memory store (tests, or fallback when persistent storage is unavailable). */
export function memoryCooldownStore(now: () => Date = () => new Date()): CooldownStore & { rows: Map<string, CooldownRecord> } {
  const rows = new Map<string, CooldownRecord>();
  return {
    rows,
    async get(p) { return rows.get(p) ?? null; },
    async record429(p, info) {
      const t = now();
      const next = nextCooldown(rows.get(p) ?? null, t, info.retryAfter);
      const rec: CooldownRecord = {
        provider: p, cooldown_until: next.until.toISOString(), consecutive_429: next.consecutive,
        recorded_at: t.toISOString(), last_status: info.status, last_reason: info.reason, endpoint: info.endpoint, dataset: info.dataset,
      };
      rows.set(p, rec);
      return rec;
    },
    async clear(p) { rows.delete(p); },
  };
}
