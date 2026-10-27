import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryCooldownStore, nextCooldown, type CooldownRecord } from "./provider-cooldown";
import { getHistoricalWeather, type CachedGroup, type HistCacheKey, type HistCacheStore, type HistoricalWeatherResult } from "./historical-weather.server";
import { getWeather } from "./weather.server";
import { isSavableClimate } from "./historical-climate-view";

// All provider traffic is mocked: no request reaches Open-Meteo.
afterEach(() => vi.unstubAllGlobals());

function memCache(): HistCacheStore & { rows: Map<string, CachedGroup>; puts: number } {
  const rows = new Map<string, CachedGroup>();
  const k = (key: HistCacheKey) => `${key.model}|${key.dataVersion}|${key.latitude}|${key.longitude}|${key.start}|${key.end}`;
  const store = {
    rows, puts: 0,
    async get(key: HistCacheKey) { return rows.get(k(key)) ?? null; },
    async put(key: HistCacheKey, g: CachedGroup) { store.puts++; rows.set(k(key), g); },
  };
  return store;
}

const days = ["2020-01-01", "2020-01-02"];
function archiveOk(url: string) {
  const model = new URL(url).searchParams.get("models");
  const daily: Record<string, unknown> = { time: days };
  for (const v of new URL(url).searchParams.get("daily")!.split(",")) daily[v] = [1, 2];
  return new Response(JSON.stringify({ latitude: 40.9, longitude: 69.5, elevation: 500, timezone: "Asia/Tashkent", daily, model }), { status: 200 });
}
const tooMany = () => new Response(JSON.stringify({ error: true, reason: "Daily API request limit exceeded. Please try again tomorrow." }), { status: 429 });

function mockFetch(handler: (url: string) => Response) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => { const u = String(input); calls.push(u); return handler(u); }));
  return calls;
}

describe("provider cooldown backoff", () => {
  const prev = (n: number, at: Date): CooldownRecord => ({ provider: "p", cooldown_until: at.toISOString(), consecutive_429: n,
    recorded_at: at.toISOString(), last_status: 429, last_reason: null, endpoint: null, dataset: null });
  const now = new Date("2026-10-18T06:00:00Z");
  it("first 429 starts a 15-minute cooldown", () => {
    expect(nextCooldown(null, now, null).until.getTime() - now.getTime()).toBe(15 * 60_000);
  });
  it("parallel 429s within one minute count as one event", () => {
    const p = prev(1, new Date(now.getTime() - 5_000));
    expect(nextCooldown(p, now, null).consecutive).toBe(1);
  });
  it("consecutive 429s double the cooldown, capped at 6 hours", () => {
    const earlier = new Date(now.getTime() - 20 * 60_000);
    expect(nextCooldown(prev(1, earlier), now, null).until.getTime() - now.getTime()).toBe(30 * 60_000);
    expect(nextCooldown(prev(10, earlier), now, null).until.getTime() - now.getTime()).toBe(360 * 60_000);
  });
  it("a longer Retry-After header wins but stays within the cap", () => {
    expect(nextCooldown(null, now, "3600").until.getTime() - now.getTime()).toBe(3600_000);
    expect(nextCooldown(null, now, "999999").until.getTime() - now.getTime()).toBe(360 * 60_000);
  });
});

describe("historical weather request reuse and 429 handling", () => {
  it("reuses saved dataset responses without any provider request", async () => {
    const cache = memCache(); const cooldown = memoryCooldownStore();
    const calls = mockFetch(archiveOk);
    await getHistoricalWeather(41.1, 69.1, { cache, cooldown });
    expect(calls.length).toBe(2); // one ERA5-Land + one ERA5 request
    const again = await getHistoricalWeather(41.1, 69.1, { cache, cooldown });
    expect(calls.length).toBe(2);
    expect(again.diagnostics).toEqual({ provider_requests: 0, cache: { era5_land: "hit", era5: "hit" } });
  });

  it("refetches after the 30-day reuse window", async () => {
    const cache = memCache(); const cooldown = memoryCooldownStore();
    const calls = mockFetch(archiveOk);
    await getHistoricalWeather(41.2, 69.2, { cache, cooldown });
    const later = new Date(Date.now() + 31 * 24 * 3600_000);
    await getHistoricalWeather(41.2, 69.2, { cache, cooldown, now: () => later });
    expect(calls.length).toBe(4);
  });

  it("fetches only the missing dataset", async () => {
    const cache = memCache(); const cooldown = memoryCooldownStore();
    mockFetch((u) => (u.includes("models=era5_land") ? archiveOk(u) : tooMany()));
    await getHistoricalWeather(41.3, 69.3, { cache, cooldown });
    await cooldown.clear("open-meteo-archive"); // cooldown elapsed
    const calls = mockFetch(archiveOk);
    const r = await getHistoricalWeather(41.3, 69.3, { cache, cooldown });
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("models=era5&");
    expect(r.diagnostics?.cache).toEqual({ era5_land: "hit", era5: "miss" });
  });

  it("a 429 is not retried, not cached, not 'no data', and starts a cooldown", async () => {
    const cache = memCache(); const cooldown = memoryCooldownStore();
    const calls = mockFetch(tooMany);
    const r = await getHistoricalWeather(41.4, 69.4, { cache, cooldown });
    expect(calls.length).toBe(2);
    expect(r.status).toBe("error");
    expect(r.error_kind).toBe("rate_limited");
    expect(r.retry_after).toBeTruthy();
    expect(cache.puts).toBe(0);
    const during = await getHistoricalWeather(41.4, 69.4, { cache, cooldown });
    expect(calls.length).toBe(2); // nothing sent during the cooldown
    expect(during.diagnostics?.cache).toEqual({ era5_land: "skipped_cooldown", era5: "skipped_cooldown" });
  });

  it("allows one fresh request after the cooldown and clears it on success", async () => {
    const cache = memCache(); const cooldown = memoryCooldownStore();
    mockFetch(tooMany);
    await getHistoricalWeather(41.5, 69.5, { cache, cooldown });
    const after = new Date(Date.now() + 16 * 60_000);
    const calls = mockFetch(archiveOk);
    const r = await getHistoricalWeather(41.5, 69.5, { cache, cooldown, now: () => after });
    expect(calls.length).toBe(2);
    expect(r.status).not.toBe("error");
    expect(cooldown.rows.size).toBe(0);
  });

  it("a rate-limited or failed result is never saved over valid data", () => {
    const ok = { status: "partial", annual: [{}], monthly: [{}], sources: [{ status: "success" }, { status: "partial" }] } as unknown as HistoricalWeatherResult;
    const oneFailed = { ...ok, sources: [{ status: "success" }, { status: "error" }] } as unknown as HistoricalWeatherResult;
    const failed = { ...ok, status: "error", annual: [], monthly: [] } as unknown as HistoricalWeatherResult;
    expect(isSavableClimate(ok)).toBe(true);
    expect(isSavableClimate(oneFailed)).toBe(false);
    expect(isSavableClimate(failed)).toBe(false);
  });
});

describe("current weather 429 handling", () => {
  it("sends one request on 429, then none during the cooldown", async () => {
    const cooldown = memoryCooldownStore();
    const calls = mockFetch(tooMany);
    const r = await getWeather(41.6, 69.6, { cooldown });
    expect(calls.length).toBe(1);
    expect(r.error_kind).toBe("rate_limited");
    const again = await getWeather(41.6, 69.6, { cooldown });
    expect(calls.length).toBe(1);
    expect(again.diagnostics).toEqual({ cache: "skipped_cooldown", provider_requests: 0 });
  });

  it("reuses a successful response from the 30-minute cache", async () => {
    const cooldown = memoryCooldownStore();
    const calls = mockFetch(() => new Response(JSON.stringify({ timezone: "Asia/Tashkent", current: { temperature_2m: 20 },
      daily: { time: ["a", "b", "c", "d", "e", "f", "g"] } }), { status: 200 }));
    await getWeather(41.7, 69.7, { cooldown });
    const again = await getWeather(41.7, 69.7, { cooldown });
    expect(calls.length).toBe(1);
    expect(again.diagnostics?.cache).toBe("hit");
  });

  it("historical and current weather cooldowns are independent", async () => {
    const cooldown = memoryCooldownStore();
    mockFetch(tooMany);
    await getWeather(41.8, 69.8, { cooldown });
    expect(cooldown.rows.has("open-meteo-forecast")).toBe(true);
    expect(cooldown.rows.has("open-meteo-archive")).toBe(false);
  });
});
