/**
 * Pure helpers for the AI Agronomy Assistant. The stored rule-based assessment is the single
 * source of truth: the AI only explains it. Nothing here calculates or changes a score.
 */
import { z } from "zod";
import { SOIL_RULES_VERSION } from "../crop-suitability/soil-policy";
import type { CropResult } from "../crop-suitability/engine";

export interface AssessmentRow {
  id: string;
  created_at: string;
  irrigation: string;
  planting_month: number | null;
  profile_version: string;
  rules_version: string;
  climate_status: string;
  climate_summary: unknown;
  preliminary: boolean;
  crops: CropResult[];
  ec_e_ds_per_m: number | null;
  ec_source: string | null;
  salinity_risk: string | null;
  water_quality: string | null;
  drainage: string | null;
  reclaimed: string | null;
}

export interface SoilRow { ph: number | null; clay: number | null; sand: number | null; silt: number | null; nitrogen: number | null; organic_carbon: number | null; cec: number | null; source: string }
export interface WeatherRow { current_temperature_c: number | null; current_precipitation_mm: number | null; current_relative_humidity_percent: number | null; fetched_at: string | null; forecast: unknown }

/** FNV-1a 32-bit — deterministic, runtime-independent. */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/** Identifies exactly which assessment content an explanation describes. */
export function sourceVersion(a: AssessmentRow): string {
  const core = JSON.stringify({
    id: a.id, p: a.profile_version, r: a.rules_version, ece: a.ec_e_ds_per_m, risk: a.salinity_risk,
    crops: a.crops.map((c) => [c.slug, c.rank, c.score, c.level, c.confidence, c.completeness, c.factors.map((f) => [f.key, f.status, f.score])]),
  });
  return `${a.rules_version}#${fnv(core)}`;
}

/** Validated high-risk location with no lab salinity: no crop may be recommended. */
export function isSalinityBlocked(a: AssessmentRow): boolean {
  return a.salinity_risk === "high" && (a.ec_e_ds_per_m === null || a.ec_e_ds_per_m === undefined);
}

export function overallStatus(a: AssessmentRow): "insufficient_data" | "preliminary" | "supported" {
  if (a.crops.every((c) => c.score === null)) return "insufficient_data";
  if (isSalinityBlocked(a)) return "preliminary";
  return a.preliminary ? "preliminary" : "supported";
}

/** Compact facts sent to the model. Missing values stay null — never filled. */
export function buildContext(a: AssessmentRow, soil: SoilRow | null, weather: WeatherRow | null) {
  const soilOnly = a.rules_version === SOIL_RULES_VERSION;
  const cs = (a.climate_summary ?? null) as { source?: string; period?: string; status?: string; sources?: unknown; avg_annual_precipitation_mm?: number | null; avg_annual_mean_temperature_c?: number | null; avg_annual_et0_mm?: number | null; warnings?: unknown } | null;
  return {
    status: overallStatus(a),
    salinity_blocked: isSalinityBlocked(a),
    assessment_scope: soilOnly ? "soil_compatibility_only" : "historical_assessment_original_model",
    excluded_domains: soilOnly ? ["climate", "weather", "water availability", "irrigation", "planting calendar", "field management"] : [],
    irrigation_declared: soilOnly ? null : a.irrigation,
    planting_month: soilOnly ? null : a.planting_month,
    versions: { profile: a.profile_version, rules: a.rules_version },
    salinity: {
      high_risk_location: a.salinity_risk === "high",
      lab_ece_ds_per_m: a.ec_e_ds_per_m,
      ece_source: a.ec_source,
      status: a.ec_e_ds_per_m === null ? "unknown (not lab-tested; never inferred)" : "lab-measured by user",
      irrigation_water_quality: a.water_quality ?? "unknown",
      drainage: a.drainage ?? "unknown",
      reclaimed: a.reclaimed ?? "unknown",
      zone_note: "Automatic Aral seabed screening covers only part of the former seabed; it cannot detect the whole seabed.",
    },
    soil: soil
      ? { source: "SoilGrids 2.0 model prediction, 0-5 cm, ~250 m — NOT a lab test", ph: soil.ph, clay_pct: soil.clay, sand_pct: soil.sand, silt_pct: soil.silt, nitrogen_g_per_kg: soil.nitrogen, organic_carbon_g_per_kg: soil.organic_carbon, cec_cmol_per_kg: soil.cec }
      : null,
    current_weather: !soilOnly && weather
      ? { source: "Open-Meteo forecast model (not a field station)", temperature_c: weather.current_temperature_c, precipitation_mm: weather.current_precipitation_mm, humidity_pct: weather.current_relative_humidity_percent, fetched_at: weather.fetched_at }
      : null,
    historical_climate: soilOnly ? { status: "excluded_soil_only", data: null } : cs
      ? { source: cs.source ?? "Legacy Open-Meteo ERA5 / ERA5-Land reanalysis (modelled, not field measurements)", sources: cs.sources ?? [], period: cs.period ?? null, status: a.climate_status, avg_annual_precipitation_mm: cs.avg_annual_precipitation_mm ?? null, avg_annual_mean_temperature_c: cs.avg_annual_mean_temperature_c ?? null, avg_annual_et0_mm: cs.avg_annual_et0_mm ?? null, warnings: cs.warnings ?? [] }
      : { status: a.climate_status, data: null },
    crops: a.crops.map((c) => ({
      slug: c.slug, name: c.name, name_uz: c.nameUz, rank: c.rank, score: c.score, level: c.level,
      confidence: c.confidence, completeness_pct: c.completeness, rank_reason: c.rankReason,
      factors: c.factors.map((f) => ({ factor: f.label, weight: f.weight, status: f.status, score_0_100: f.score === null ? null : Math.round(f.score * 100), detail: f.detail,
        ...(f.key === "calendar" ? { zone_resolution: f.zoneResolution ?? null } : {}) })),
      reasons: c.reasons, limitations: c.limitations, needs_verification: c.needsVerification, water: c.water,
      season: c.season,
      score_label: soilOnly ? "Preliminary soil-based suitability — soil compatibility only, 0–100 with no artificial cap, not probability, yield or planting recommendation" : "Historical suitability score — original saved model",
      scoring_diagnostics: c.diagnostics ?? null,
    })),
  };
}

export const explanationSchema = z.object({
  overall: z.object({
    summary: z.string(),
    support: z.string(),
    key_limitations: z.array(z.string()),
  }),
  crops: z.array(z.object({
    slug: z.string(),
    why_this_score: z.string(),
    favorable: z.array(z.string()),
    risks: z.array(z.string()),
    missing_info: z.array(z.string()),
  })),
  water: z.object({
    explanation: z.string(),
    unknowns: z.array(z.string()),
  }),
  next_actions: z.array(z.string()),
  transparency: z.object({
    sources: z.array(z.string()),
    predicted_vs_measured: z.string(),
    missing_variables: z.array(z.string()),
  }),
});
export type Explanation = z.infer<typeof explanationSchema>;

export interface SavedExplanationContent extends Explanation {
  status: ReturnType<typeof overallStatus>;
  salinity_blocked: boolean;
}

export type ExplanationLanguage = "uz" | "en" | "ru";

/** Mandatory safeguard strings, localized — these are enforced in code, not by the model. */
const SAFE = {
  uz: {
    noExplanation: "Bu ekin uchun AI izohi olinmadi.",
    blockedWhy: "Bu faqat ehtiyotkor dastlabki baho, ekish tavsiyasi emas. Yuqori sho'rlanish xavfi sabab laboratoriya ECe tekshiruvi kerak.",
    blockedRisk: "Sho'rlanish yuqori xavfli deb tasniflangan, lekin laboratoriyada o'lchanmagan.",
    soilOnlyLimit: "Bu faqat tuproq mosligining dastlabki bahosi. Iqlim, suv mavjudligi va dala boshqaruvi baholanmagan; ekish tavsiyasi emas.",
    salinityTest: "Ekishdan oldin tuproq sho'rlanishini laboratoriyada tekshirtiring (ECe — tuproqdagi tuz miqdori).",
    blockedLimit: "Bu joy yuqori sho'rlanish xavfi bo'lgan hududda va tuproq sho'rligi noma'lum — hozircha hech qaysi ekin tavsiya etilmaydi.",
    blockedSummary: "Yuqori sho'rlanish xavfi va noma'lum ECe: dastlabki baholar ekish tavsiyasi emas.",
    blockedSupport: "Laboratoriya ECe, sug'orish suvi sifati va drenaj tekshiruvisiz hech qaysi ekin tavsiya etilmaydi.",
    waterSoilOnly: "Suv mavjudligi va iqlim bu tuproq bahosiga kiritilmagan va tahlil qilinmagan.",
    waterUnknowns: "Sug'orish suvi miqdori va sifati, iqlim va drenaj mustaqil tekshirilishi kerak.",
  },
  en: {
    noExplanation: "No AI explanation was produced for this crop.",
    blockedWhy: "This is only a cautious preliminary score, not a planting recommendation. High salinity risk requires a laboratory ECe test.",
    blockedRisk: "Salinity is classified as high risk but has not been lab-measured.",
    soilOnlyLimit: "This is only a preliminary soil-compatibility score. Climate, water availability and field management are not assessed; not a planting recommendation.",
    salinityTest: "Before planting, have soil salinity lab-tested (ECe — the salt content of the soil).",
    blockedLimit: "This location is in a validated high-salinity-risk area and soil salinity is unknown — no crop is recommended for now.",
    blockedSummary: "High salinity risk and unknown ECe: preliminary scores are not a planting recommendation.",
    blockedSupport: "Without laboratory ECe, irrigation-water quality and drainage checks, no crop is recommended.",
    waterSoilOnly: "Water availability and climate are not included in or analysed by this soil assessment.",
    waterUnknowns: "Irrigation water amount and quality, climate and drainage must be checked independently.",
  },
  ru: {
    noExplanation: "AI-пояснение для этой культуры не получено.",
    blockedWhy: "Это лишь осторожная предварительная оценка, а не рекомендация по посеву. Высокий риск засоления требует лабораторного анализа ECe.",
    blockedRisk: "Засоление классифицировано как высокий риск, но не измерено в лаборатории.",
    soilOnlyLimit: "Это лишь предварительная оценка совместимости почвы. Климат, обеспеченность водой и управление полем не оцениваются; это не рекомендация по посеву.",
    salinityTest: "Перед посевом проверьте засоление почвы в лаборатории (ECe — содержание солей в почве).",
    blockedLimit: "Эта локация в зоне подтверждённого высокого риска засоления, и засоление почвы неизвестно — пока ни одна культура не рекомендуется.",
    blockedSummary: "Высокий риск засоления и неизвестный ECe: предварительные баллы — не рекомендация по посеву.",
    blockedSupport: "Без лабораторного ECe, проверки качества поливной воды и дренажа ни одна культура не рекомендуется.",
    waterSoilOnly: "Обеспеченность водой и климат не включены в эту оценку почвы и не анализировались.",
    waterUnknowns: "Количество и качество поливной воды, климат и дренаж необходимо проверить отдельно.",
  },
} as const;

/** Appended to the system prompt so the model writes in the user's selected language. */
export const LANGUAGE_DIRECTIVE: Record<ExplanationLanguage, string> = {
  uz: "Javobni to‘liq O‘ZBEK tilida (lotin yozuvi) yozing.",
  en: "Write the entire explanation in clear, simple ENGLISH. All JSON string values must be in English.",
  ru: "Напишите всё объяснение на РУССКОМ языке. Все строковые значения JSON должны быть на русском языке.",
};

const SCORE_TEXT = /\b\d{1,3}\s*(\/\s*100|ball\b|%\s*mos)/i;

/**
 * Enforce the rules in code, independent of the model: keep crops in the stored rank order,
 * drop unknown crops, strip any sentence quoting a score, and add mandatory salinity notes.
 */
export function sanitizeExplanation(raw: Explanation, a: AssessmentRow, lang: ExplanationLanguage = "uz"): SavedExplanationContent {
  const safe = SAFE[lang];
  const clean = (s: string) => s.split(/(?<=[.!?])\s+/).filter((x) => !SCORE_TEXT.test(x)).join(" ").trim();
  const cleanList = (l: string[]) => l.map(clean).filter(Boolean);
  const bySlug = new Map(raw.crops.map((c) => [c.slug, c]));
  const crops = a.crops.map((c) => {
    const e = bySlug.get(c.slug);
    return {
      slug: c.slug,
      why_this_score: e ? clean(e.why_this_score) : safe.noExplanation,
      favorable: e ? cleanList(e.favorable) : [],
      risks: e ? cleanList(e.risks) : [],
      missing_info: e ? cleanList(e.missing_info) : [],
    };
  });
  const blocked = isSalinityBlocked(a);
  if (blocked) for (const crop of crops) {
    crop.favorable = [];
    crop.why_this_score = safe.blockedWhy;
    crop.risks.unshift(safe.blockedRisk);
  }
  const next = cleanList(raw.next_actions);
  const limits = cleanList(raw.overall.key_limitations);
  const soilOnly = a.rules_version === SOIL_RULES_VERSION;
  if (soilOnly) limits.unshift(safe.soilOnlyLimit);
  if (a.ec_e_ds_per_m === null) {
    if (!next.some((x) => /sho.rlan|ECe|salin|засол/i.test(x))) next.unshift(safe.salinityTest);
  }
  if (blocked) {
    limits.unshift(safe.blockedLimit);
  }
  return {
    status: overallStatus(a),
    salinity_blocked: blocked,
    overall: { summary: blocked ? safe.blockedSummary : clean(raw.overall.summary), support: blocked ? safe.blockedSupport : clean(raw.overall.support), key_limitations: limits },
    crops,
    water: soilOnly ? { explanation: safe.waterSoilOnly, unknowns: [safe.waterUnknowns] } : { explanation: clean(raw.water.explanation), unknowns: cleanList(raw.water.unknowns) },
    next_actions: next,
    transparency: { sources: cleanList(raw.transparency.sources), predicted_vs_measured: clean(raw.transparency.predicted_vs_measured), missing_variables: cleanList(raw.transparency.missing_variables) },
  };
}

export const SYSTEM_PROMPT = `Siz AgroAI uchun agronomiya yordamchisisiz. Vazifangiz: berilgan qoidaga asoslangan ekin baholashini fermerga oddiy, amaliy O'ZBEK tilida (lotin yozuvi) tushuntirish.

QAT'IY QOIDALAR:
- Ballarni hisoblamang, o'zgartirmang va hech qanday raqamli ball yozmang (masalan "72/100"). Ballar ilovada alohida ko'rsatiladi.
- Ekinlar tartibini o'zgartirmang; har bir ekin uchun berilgan "slug" ni aynan qaytaring.
- Faqat berilgan ma'lumotlardan foydalaning. O'lchov, manba, ekin talabi yoki faktni o'ylab topmang. null qiymat = ma'lumot yo'q; uni taxmin qilmang, "noma'lum" deb ayting.
- Sho'rlanishni pH yoki boshqa tuproq xususiyatlaridan chiqarmang. Laboratoriya ECe bo'lmasa, sho'rlanish "noma'lum".
- Agar salinity_blocked=true bo'lsa: hech qaysi ekinni tavsiya qilmang, yer ekishga xavfsiz degan ma'no bermang, raqamli ball ishonchli emasligini va nima uchun laboratoriya tekshiruvi kerakligini tushuntiring.
- Butun sobiq Orol dengizi tubini avtomatik aniqlash mumkin deb da'vo qilmang.
- assessment_scope=soil_compatibility_only bo'lsa: faqat tuproq mosligini tushuntiring. Iqlim, ob-havo, yog'in, harorat, ET0, suv mavjudligi, sug'orish va ekish taqvimi tahlil qilinmagan; ularni ijobiy yoki salbiy ball omili sifatida ko'rsatmang. Suv bo'limida faqat baholanmaganini ayting. Ball 0 dan 100 gacha, sun'iy yuqori chegarasiz; u faqat mavjud o'lchovlar asosida hisoblangan tuproq mosligi. O'lchanmagan xususiyatlar ballni pasaytirmaydi — faqat ishonch va ma'lumot to'liqligini kamaytiradi. Qo'llab-quvvatlangan tuproq qoidasi o'lchanmasa, ball ko'rsatilmaydi. Total nitrogen o'simlikka mavjud azot emas; organik uglerod yoki CEC unumdorlikni isbotlamaydi.
- Faqat historical_assessment_original_model uchun: yillik yog'ingarchilikni ekin uchun foydali suv bilan tenglashtirmang; faqat mavsumdagi samarali yog'in hisobga olinishini, sug'orish e'lon qilingani suv yetarli yoki sifatli ekanini isbotlamasligini tushuntiring. Suv sifati yoki drenaj noma'lum bo'lsa, buni aniq ayting.
- O'g'it retsepti, hosil yoki foyda va'dasi bermang. O'zbekistonda mahalliy tasdiqlangan deb da'vo qilmang (qoidalar xalqaro FAO yo'riqnomalari).
- SoilGrids — model bashorati (laboratoriya emas); ERA5 — reanaliz (dala o'lchovi emas). Buni farqlang.
- Ma'lumot yetarli bo'lmasa, ishonchli tavsiya o'rniga "ma'lumot yetarli emas" deb tushuntiring.
- Ekish taqvimi uchun zone_resolution.status="unavailable" bo'lsa, mahalliy zona tasdiqlanmagan deb ayting; boshqa zonaning ekish muddatini ishlatmang yoki ekish oyi shu joyga mos deb da'vo qilmang.
- Texnik atamani ishlatsangiz, qisqacha oddiy so'z bilan izohlang. Qisqa va aniq yozing.`;
