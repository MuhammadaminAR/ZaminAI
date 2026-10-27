import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { BASELINE_START, BASELINE_END, combineCells, type ClimateCell } from "./prepared-climate";

/** Small RLS-scoped database read only. No provider fetch, raster parsing, or privileged write. */
export async function lookupPreparedClimate(db: SupabaseClient<Database>, latitude: number, longitude: number) {
  const { data, error } = await db.from("prepared_climate_cells").select("*")
    .eq("start_date", BASELINE_START).eq("end_date", BASELINE_END)
    .lte("west", longitude).gt("east", longitude).lte("south", latitude).gt("north", latitude).limit(10);
  if (error) throw new Error("Prepared climate data could not be read. Please try again.");
  return combineCells((data ?? []) as ClimateCell[], latitude, longitude);
}