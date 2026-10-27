import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { isInsideUzbekistan } from "./uz-boundary";
import { isExposedAralSeabed } from "./crop-suitability/aral-seabed";
import { assessSoilCrops } from "./crop-suitability/soil-engine";

const MAX_PER_MINUTE = 6;
const hits = new Map<string, number[]>();

const inputSchema = z.object({
  analysisId: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  irrigation: z.enum(["reliable", "limited", "rainfed", "unknown"]).default("unknown"),
  plantingMonth: z.number().int().min(1).max(12).nullable().default(null),
  /** Lab-measured soil salinity ECe (dS/m). Null = not assessed; never inferred. */
  salinityEce: z.number().min(0.05).max(60).nullable().optional(),
  waterQuality: z.enum(["fresh", "saline", "unknown"]).nullable().optional(),
  drainage: z.enum(["yes", "no", "unknown"]).nullable().optional(),
  reclaimed: z.enum(["yes", "no", "unknown"]).nullable().optional(),
});

/** crop-suitability-analysis: deterministic, rule-based crop screening for a saved analysis. */
export const cropSuitabilityAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req, error } = await supabase
      .from("analysis_requests")
      .select("id,user_id,farm_id,farms(latitude,longitude,country_code,salinity_risk_override,region,district,locality,location_status,location_source),soil_analyses!soil_analyses_analysis_request_id_fkey(id,ph,clay,sand,silt,nitrogen,organic_carbon,cec,source,created_at)")
      .eq("id", data.analysisId)
      .maybeSingle();
    if (error) throw new Error("Could not load the analysis.");
    if (!req || req.user_id !== userId) throw new Error("Analysis not found.");
    const farm = req.farms as unknown as { latitude: number; longitude: number; country_code: string | null; salinity_risk_override: string | null; region: string | null; district: string | null; locality: string | null; location_status: string; location_source: string };
    if (farm.latitude !== data.latitude || farm.longitude !== data.longitude) {
      throw new Error("Coordinates do not match the saved farm.");
    }
    if (farm.country_code !== "UZ" || !isInsideUzbekistan(data.latitude, data.longitude)) {
      throw new Error("Location outside supported area – ZaminAI currently supports land analysis in Uzbekistan.");
    }
    const now = Date.now();
    const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= MAX_PER_MINUTE) throw new Error("Too many crop assessments. Please wait a minute and try again.");
    hits.set(userId, [...recent, now]);

    // Only real SoilGrids rows are used — demo soil is never scored.
    const soilRow = (req.soil_analyses ?? [])
      .filter((s) => s.source === "soilgrids")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const soil = soilRow ? { ph: n(soilRow.ph), clayPct: n(soilRow.clay), sandPct: n(soilRow.sand), siltPct: n(soilRow.silt), nitrogenGPerKg: n(soilRow.nitrogen), organicCarbonGPerKg: n(soilRow.organic_carbon), cecCmolPerKg: n(soilRow.cec) } : null;

    const climateStatus = "excluded_soil_only";
    const salinityEce = data.salinityEce ?? null;
    // Manual review flag wins; otherwise the exposed-seabed screening polygon decides.
    const salinityRisk = farm.salinity_risk_override === "high" || farm.salinity_risk_override === "standard"
      ? farm.salinity_risk_override
      : isExposedAralSeabed(data.latitude, data.longitude) ? ("high" as const) : ("standard" as const);
    const result = assessSoilCrops({ soil, salinityEce, salinityRisk,
      latitude: farm.latitude, longitude: farm.longitude, countryCode: farm.country_code });
    // All current profiles are provisional, never locally validated recommendations.
    const preliminary = true;
    const { data: row, error: insErr } = await supabase
      .from("crop_suitability_assessments")
      .insert({
        user_id: userId, farm_id: req.farm_id, analysis_request_id: req.id, soil_analysis_id: soilRow?.id ?? null,
        latitude: data.latitude, longitude: data.longitude, irrigation: "unknown", planting_month: null,
        profile_version: result.profileVersion, rules_version: result.rulesVersion,
        weights: result.weights as unknown as Json, crops: result.crops as unknown as Json,
        climate_summary: null, climate_status: climateStatus, preliminary,
        ec_e_ds_per_m: salinityEce, ec_source: salinityEce === null ? null : "user_provided_lab_test",
        water_quality: data.waterQuality ?? null, drainage: data.drainage ?? null, reclaimed: data.reclaimed ?? null,
        salinity_risk: salinityRisk,
      })
      .select("id,created_at")
      .single();
    if (insErr) throw new Error("Could not save the crop assessment.");
    return { id: row.id, createdAt: row.created_at, climateStatus, preliminary, ...result };
  });
