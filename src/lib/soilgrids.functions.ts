import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const coordsSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

const MAX_PER_MINUTE = 10;

/** soilgrids-analysis: SoilGrids 0-5cm Q0.5 estimates for a point (signed-in users, rate limited). */
export const soilgridsAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => coordsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await context.supabase
      .from("soilgrids_lookups")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_PER_MINUTE) {
      throw new Error("Too many soil lookups. Please wait a minute and try again.");
    }
    await context.supabase.from("soilgrids_lookups").insert({ user_id: context.userId });
    const { getSoilGrids } = await import("./soilgrids.server");
    return getSoilGrids(data.latitude, data.longitude);
  });
