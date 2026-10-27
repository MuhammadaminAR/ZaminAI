/** Pure SoilGrids-only compatibility. No weather, calendar or irrigation inputs. */
import { SOIL_CROP_PROFILES, SOIL_PROFILE_VERSION } from "./soil-profiles";
import { textureGroup, type CropResult, type FactorResult, type Level, type SoilInput, type SalinityRisk } from "./engine";
import type { RiskCap } from "./fallback-policy";
import { SOIL_POLICY, SOIL_RULES_VERSION, SOIL_SCORE_BANDS } from "./soil-policy";
import { isInsideUzbekistan } from "../uz-boundary";

export interface SoilOnlyInput {
  soil: (SoilInput & { nitrogenGPerKg?: number | null; organicCarbonGPerKg?: number | null; cecCmolPerKg?: number | null }) | null;
  latitude: number; longitude: number; countryCode: string | null;
  salinityEce: number | null; salinityRisk: SalinityRisk;
}
const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

function soilLevel(score: number | null): Level {
  if (score === null) return "Insufficient data";
  if (score >= SOIL_SCORE_BANDS.strong) return "Strong soil match";
  if (score >= SOIL_SCORE_BANDS.reasonable) return "Reasonable soil match";
  if (score >= SOIL_SCORE_BANDS.mixed) return "Mixed or limited soil match";
  return "Substantial soil limitations";
}

export function assessSoilCrops(input: SoilOnlyInput) {
  const valid = input.countryCode === "UZ" && finite(input.latitude) && finite(input.longitude) && isInsideUzbekistan(input.latitude, input.longitude);
  const soil = input.soil;
  const ph = finite(soil?.ph) && soil.ph >= 0 && soil.ph <= 14 ? soil.ph : null;
  const texParts = soil ? [soil.sandPct, soil.siltPct, soil.clayPct] : [];
  const texSum = texParts.every((v) => finite(v) && v >= 0 && v <= 100) ? texParts.reduce<number>((a, b) => a + (b as number), 0) : null;
  // SoilGrids predicts each fraction independently, so sums near but not exactly 100 are normal.
  // A complete triple within 80–120 is rescaled to 100 for classification; missing components are never zero-filled.
  const textureNormalized = texSum !== null && texSum >= 80 && texSum <= 120 && Math.abs(texSum - 100) > 2;
  const texture = texSum !== null && texSum >= 80 && texSum <= 120
    ? textureGroup((texParts[0] as number) / texSum * 100, (texParts[1] as number) / texSum * 100, (texParts[2] as number) / texSum * 100) : null;
  const usable = !!soil && Object.entries(soil).some(([key, v]) => finite(v) && v >= 0 && (key === "ph" ? v <= 14 : key.endsWith("Pct") ? v <= 100 : true));
  const high = input.salinityRisk === "high";
  const ece = finite(input.salinityEce) && input.salinityEce >= 0.05 && input.salinityEce <= 60 ? input.salinityEce : null;
  const raw: CropResult[] = SOIL_CROP_PROFILES.map((p) => {
    const factors: FactorResult[] = [];
    const reasons: string[] = [], limitations: string[] = [], needsVerification: string[] = [];
    const add = (key: FactorResult["key"], label: string, weight: number, score: number | null, detail: string, sources: string[] = [], validation = "unverified") => {
      factors.push({ key, label, weight, score, status: score === null ? "unavailable" : "scored", detail, sources, validation });
      if (score !== null) (score >= 0.8 ? reasons : limitations).push(detail);
    };
    const phRule = p.ph.validation !== "unverified" ? p.ph.value : null;
    const phScore = phRule && ph !== null ? clamp(1 - Math.max(phRule[0] - ph, ph - phRule[1], 0) / SOIL_POLICY.phDeclineSpan) : null;
    add("ph", "Soil pH", SOIL_POLICY.phWeight, phScore, phScore === null ? phRule ? "SoilGrids pH unavailable." : p.ph.note
      : `Estimated pH ${ph}; crop preferred range ${phRule?.join("–")}. Linear decline over ${SOIL_POLICY.phDeclineSpan} pH units outside the range is a product interpretation, not a sourced scientific response curve.`, p.ph.sources, p.ph.validation);
    const textureRule = p.texture.validation !== "unverified" ? p.texture.value : null;
    const textureScore = textureRule && texture ? textureRule.includes(texture.group) ? 1 : SOIL_POLICY.textureMismatchScore : null;
    add("texture", "Clay / sand / silt texture", SOIL_POLICY.textureWeight, textureScore, textureScore === null ? textureRule ? "Complete SoilGrids clay/sand/silt proportions unavailable or implausible (sum outside 80–120); missing components are never zero-filled." : p.texture.note
      : `Estimated ${texture?.cls} (${texture?.group})${textureNormalized ? `; independently predicted fractions sum to ${Math.round(texSum ?? 0)}% and were rescaled to 100% for classification` : ""}; preferred ${textureRule?.join("/")}. Texture grouping and mismatch credit are product interpretations; texture does not prove drainage.`, p.texture.sources, p.texture.validation);
    add("nitrogen", "Total nitrogen", 0, null, `${finite(soil?.nitrogenGPerKg) ? "Estimate available; " : "Estimate unavailable; "}no defensible crop-specific scoring rule. Total nitrogen is not plant-available nitrogen.`);
    add("organic_carbon", "Soil organic carbon", 0, null, `${finite(soil?.organicCarbonGPerKg) ? "Estimate available; " : "Estimate unavailable; "}no defensible crop-specific scoring rule; carbon alone does not prove fertility.`);
    add("cec", "CEC", 0, null, `${finite(soil?.cecCmolPerKg) ? "Estimate available; " : "Estimate unavailable; "}no defensible crop-specific scoring rule; CEC alone does not prove fertility.`);
    const scored = factors.filter((f) => f.score !== null && f.weight > 0);
    const coverage = scored.reduce((s, f) => s + f.weight, 0);
    // Weighted average over the available supported factors only. Missing measurements reduce
    // confidence and completeness, never the numeric score, and are never zero-filled.
    const observed = coverage ? scored.reduce((s, f) => s + f.weight * (f.score ?? 0), 0) / coverage * 100 : null;
    const caps: RiskCap[] = [];
    let salinityMultiplier = 1;
    const tolerance = p.salinityTolerance.validation !== "unverified" ? p.salinityTolerance.value : null;
    if (high && ece === null) caps.push({ key: "high_salinity_without_lab", cap: SOIL_POLICY.highSalinityWithoutLabCap, reason: "Validated high salinity risk without lab ECe; no planting recommendation." });
    if (ece !== null && tolerance) {
      salinityMultiplier = clamp(1 - tolerance.slopePctPerDs * Math.max(0, ece - tolerance.thresholdEce) / 100);
      if (salinityMultiplier < 1) limitations.push(`Lab ECe ${ece} dS/m exceeds ${p.name} tolerance ${tolerance.thresholdEce} dS/m. Maas–Hoffman tolerance is used only as a negative safety reduction, not a SoilGrids factor or yield prediction.`);
      if (salinityMultiplier === 0) caps.push({ key: "measured_extreme_salinity", cap: SOIL_POLICY.zeroSalinityToleranceCap, reason: "Lab ECe reaches the crop's zero-tolerance screening response." });
    }
    const scoreCap = caps.length ? Math.min(...caps.map((c) => c.cap)) : 100;
    const score = valid && usable && observed !== null ? Math.round(Math.min(scoreCap, observed * salinityMultiplier)) : null;
    const confidence = score !== null && coverage === 100 && !(high && ece === null) ? "Medium" : "Low";
    limitations.push("Climate, water availability, irrigation, planting calendar and field management are not included. Soil-only scores cannot identify drought risk, deserts or adequate irrigation.", "SoilGrids is a 0–5 cm model estimate, not a field lab test. Crop requirements are international, not officially validated for Uzbekistan.");
    if (coverage > 0 && coverage < 100) limitations.push(`Score is the weighted average of the ${coverage}% of supported soil weight that could be measured; the missing weight lowers confidence and data completeness, not the score. Missing measurements are never zero-filled.`);
    if (coverage === 0) limitations.unshift("No supported soil factor could be scored for this crop, so no numerical score is shown; an invented value would not be evidence of soil compatibility.");
    if (ece === null) needsVerification.push(high ? "Validated high salinity risk; lab ECe, irrigation-water quality and drainage checks required. Soil is not verified non-saline." : "Salinity unknown: laboratory ECe required; never inferred from pH or texture.");
    needsVerification.push(...factors.filter((f) => f.score === null).map((f) => `${f.label}: ${f.detail}`));
    return { slug: p.slug, name: p.name, nameUz: p.nameUz, score, level: soilLevel(score), confidence, completeness: coverage, factors, reasons, limitations, needsVerification,
      water: "Not assessed — climate and water availability are excluded from the soil-only model.", season: null, sources: [...new Set(scored.flatMap((f) => f.sources).concat(ece !== null ? p.salinityTolerance.sources : []))], rank: 0, rankReason: "", scoreCap,
      diagnostics: { baseScore: observed, uncertaintyAdjustedScore: observed ?? 0, uncertaintyPenalty: 0, availableFactors: scored.map((f) => f.key), missingFactors: factors.filter((f) => f.score === null).map((f) => f.key), riskCaps: caps,
        effectiveSeasonalRainfallMm: null, seasonalWaterRequirementMm: null, rainfedWaterRatio: null, policy: { ...SOIL_POLICY }, rulesVersion: SOIL_RULES_VERSION, soilPolicy: SOIL_POLICY, salinitySafetyMultiplier: salinityMultiplier } } satisfies CropResult;
  });
  raw.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name));
  const crops = raw.map((c, i) => ({ ...c, rank: i + 1, rankReason: c.score === null ? "No usable SoilGrids data or valid Uzbekistan location; not ranked by score." : raw[i - 1]?.score === c.score ? "Tied preliminary soil score; display order is not evidence of better compatibility." : "Ordered by deterministic preliminary soil compatibility, not a full crop recommendation." }));
  return { crops, profileVersion: SOIL_PROFILE_VERSION, rulesVersion: SOIL_RULES_VERSION, weights: { ph: SOIL_POLICY.phWeight, texture: SOIL_POLICY.textureWeight }, salinity: { riskZone: high, assessed: ece !== null, eceDsPerM: ece } };
}
