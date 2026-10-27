import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { SOIL_RULES_VERSION } from "./crop-suitability/soil-policy";
import { buildContext, sanitizeExplanation, sourceVersion, type AssessmentRow, type SoilRow, type WeatherRow } from "./ai-agronomy/context";

const hits = new Map<string, number[]>();

/** ai-agronomy-explanation: explains (never rescores) the latest saved crop assessment. */
export const aiAgronomyExplanation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ analysisId: z.string().uuid(), assessmentId: z.string().uuid(), language: z.enum(["uz", "en", "ru"]).default("uz") }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const lang = data.language;
    const { data: a, error } = await supabase.from("crop_suitability_assessments").select("*")
      .eq("analysis_request_id", data.analysisId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error || !a || a.user_id !== userId) throw new Error("Assessment not found.");
    if (a.id !== data.assessmentId) throw new Error("This assessment has been replaced by a newer one. Reload the page.");
    const assessment = a as unknown as AssessmentRow;
    const version = sourceVersion(assessment);

    const { data: cached } = await supabase.from("ai_agronomy_explanations").select("*")
      .eq("assessment_id", a.id).eq("source_version", version).eq("language", lang).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (cached) return { ...cached, cached: true };

    const now = Date.now();
    const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 3) throw new Error("Too many AI requests. Please wait a minute and retry.");
    hits.set(userId, [...recent, now]);

    // Reuse saved records only — no new soil/weather fetches.
    const soil = a.soil_analysis_id
      ? (await supabase.from("soil_analyses").select("ph,clay,sand,silt,nitrogen,organic_carbon,cec,source").eq("id", a.soil_analysis_id).maybeSingle()).data as SoilRow | null
      : null;
    const weather = a.rules_version === SOIL_RULES_VERSION ? null : (await supabase.from("weather_analyses").select("current_temperature_c,current_precipitation_mm,current_relative_humidity_percent,fetched_at,forecast")
      .eq("analysis_request_id", data.analysisId).order("created_at", { ascending: false }).limit(1).maybeSingle()).data as WeatherRow | null;

    const { generateExplanation, AI_MODEL, AI_PROVIDER } = await import("./ai-agronomy.server");
    const raw = await generateExplanation(buildContext(assessment, soil?.source === "soilgrids" ? soil : null, weather), lang);
    const content = sanitizeExplanation(raw, assessment, lang);
    const { data: row, error: insErr } = await supabase.from("ai_agronomy_explanations").insert({
      user_id: userId, assessment_id: a.id, analysis_request_id: data.analysisId, source_version: version,
      provider: AI_PROVIDER, model: AI_MODEL, language: lang, content: content as unknown as Json,
    }).select("*").single();
    if (insErr) throw new Error("Explanation generated but could not be saved.");
    return { ...row, cached: false };
  });
