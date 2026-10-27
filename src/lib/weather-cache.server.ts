/**
 * Persistent stores for weather provider cooldowns and the shared historical-archive cache.
 * Both tables are written only by server code with the service role (clients have no access),
 * so cached provider data cannot be altered by app users.
 */
import { nextCooldown, type CooldownRecord, type CooldownStore } from "./provider-cooldown";
import type { HistCacheStore, CachedGroup } from "./historical-weather.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export function dbCooldownStore(): CooldownStore {
  return {
    async get(provider) {
      const db = await admin();
      const { data, error } = await db.from("provider_cooldowns").select("*").eq("provider", provider).maybeSingle();
      if (error) console.error("cooldown read failed", error.message);
      return (data as CooldownRecord | null) ?? null;
    },
    async record429(provider, info) {
      const db = await admin();
      const { data: prev } = await db.from("provider_cooldowns").select("*").eq("provider", provider).maybeSingle();
      const now = new Date();
      const next = nextCooldown((prev as CooldownRecord | null) ?? null, now, info.retryAfter);
      const rec: CooldownRecord = {
        provider, cooldown_until: next.until.toISOString(), consecutive_429: next.consecutive, recorded_at: now.toISOString(),
        last_status: info.status, last_reason: info.reason?.slice(0, 300) ?? null, endpoint: info.endpoint, dataset: info.dataset,
      };
      const { error } = await db.from("provider_cooldowns").upsert(rec);
      if (error) console.error("cooldown write failed", error.message);
      return rec;
    },
    async clear(provider) {
      const db = await admin();
      await db.from("provider_cooldowns").delete().eq("provider", provider);
    },
  };
}

export function dbHistCacheStore(): HistCacheStore {
  return {
    async get(key) {
      const db = await admin();
      const { data, error } = await db.from("historical_weather_cache").select("payload,fetched_at")
        .eq("model", key.model).eq("data_version", key.dataVersion)
        .eq("latitude", key.latitude).eq("longitude", key.longitude)
        .eq("start_date", key.start).eq("end_date", key.end).maybeSingle();
      if (error) { console.error("historical cache read failed", error.message); return null; }
      if (!data) return null;
      return { ...(data.payload as unknown as CachedGroup), fetched_at: data.fetched_at };
    },
    async put(key, group) {
      const db = await admin();
      const { error } = await db.from("historical_weather_cache").upsert({
        model: key.model, data_version: key.dataVersion, latitude: key.latitude, longitude: key.longitude,
        start_date: key.start, end_date: key.end,
        returned_latitude: group.meta.returned.latitude, returned_longitude: group.meta.returned.longitude,
        status: group.meta.status === "success" ? "success" : "partial",
        payload: group as never, fetched_at: group.fetched_at,
      }, { onConflict: "model,data_version,latitude,longitude,start_date,end_date" });
      if (error) console.error("historical cache write failed", error.message);
    },
  };
}
