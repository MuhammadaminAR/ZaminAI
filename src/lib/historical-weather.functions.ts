import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { coordsSchema } from "./soilgrids.functions";
import { isInsideUzbekistan } from "./uz-boundary";

const MAX_PER_MINUTE = 5;
const hits = new Map<string, number[]>();

/** Database-only prepared climate lookup; retained name for existing callers. */
export const historicalWeatherAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => coordsSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!isInsideUzbekistan(data.latitude, data.longitude)) {
      throw new Error("Location outside supported area – AgroAI currently supports land analysis in Uzbekistan.");
    }
    const now = Date.now();
    const recent = (hits.get(context.userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= MAX_PER_MINUTE) {
      throw new Error("Too many historical weather lookups. Please wait a minute and try again.");
    }
    hits.set(context.userId, [...recent, now]);
    const { lookupPreparedClimate } = await import("./prepared-climate.server");
    return lookupPreparedClimate(context.supabase, data.latitude, data.longitude);
  });
