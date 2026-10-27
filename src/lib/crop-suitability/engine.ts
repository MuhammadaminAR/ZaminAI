/**
 * Deterministic crop suitability engine (AgroAI screening rules). Pure — no I/O.
 * Same inputs always give the same output. Missing data is never turned into zero:
 * a factor without data or a supported rule stays unavailable. A separately disclosed
 * conservative uncertainty allowance and risk caps prevent sparse data inflating scores.
 */
import { CROP_PROFILES, PROFILE_VERSION, UZ_AEZ, type CalendarSession, type CropSuitabilityProfile, type TextureGroup, type TemperatureRule } from "./profiles";
import { resolveCalendarZone, type CalendarLocation, type ZoneResolution } from "./zone-resolution";
import { isInsideUzbekistan } from "../uz-boundary";
import { FALLBACK_POLICY, uncertaintyScore, type RiskCap } from "./fallback-policy";

export const RULES_VERSION = "suitability-rules-v5-preliminary-risk-caps";

export type FactorKey = "ph" | "texture" | "temperature" | "water" | "salinity" | "calendar";
export type SoilFactorKey = "nitrogen" | "organic_carbon" | "cec";
export type Irrigation = "reliable" | "limited" | "rainfed" | "unknown";

/**
 * Weights (sum 100). Climate and water carry the most weight because in Uzbekistan's
 * arid climate they decide whether a crop can complete its season at all; salinity is a
 * critical agronomic constraint in an irrigated arid region and is scored ONLY from an
 * actual ECe measurement (never inferred from pH, texture, nitrogen, CEC or organic carbon);
 * pH is a single well-sourced number; texture is lower because it is mapped from qualitative
 * FAO wording; calendar is scored only with verified local zone evidence.
 */
export const WEIGHTS: Record<FactorKey, number> = { temperature: 25, water: 25, ph: 15, texture: 10, salinity: 15, calendar: 10 };

/** AgroAI screening categories — not official agricultural certifications. */
/**
 * Irrigation is user-declared and is NOT proof of sufficient water, water quality or drainage.
 * AgroAI rule (configurable, not sourced): declared irrigation earns a base credit; the rest of
 * the water score comes from how much of the need effective rainfall covers.
 */
export const IRRIGATION_BASE_CREDIT = { reliable: 0.8 } as const;
/** AgroAI rule: sowing within 1 month of an FAO window scores this; further away scores 0. */
export const CALENDAR_NEAR_SCORE = 0.5;

/** FAO Manual 3 §4.2 effective rainfall, per month (mm). Valid for slopes ≤ 4–5 %. */
export function effectiveRainfall(p: number): number {
  return Math.max(0, p > 75 ? 0.8 * p - 25 : 0.6 * p - 10);
}

/** Month distance from m to a sowing window (0 = inside). */
function monthDistance(m: number, s: CalendarSession): number {
  const a = s.sowFrom[0], b = s.sowTo[0];
  const inside = a <= b ? m >= a && m <= b : m >= a || m <= b;
  if (inside) return 0;
  const d = (x: number, y: number) => Math.min((x - y + 12) % 12, (y - x + 12) % 12);
  return Math.min(d(m, a), d(m, b));
}

export const LEVEL_THRESHOLDS = { potentially: 70, moderately: 45 } as const;
export const MIN_COMPLETENESS = 50;

export type Level = "Potentially suitable" | "Moderately suitable" | "Low suitability" | "Insufficient data"
  | "Strong soil match" | "Reasonable soil match" | "Mixed or limited soil match" | "Substantial soil limitations";
export type Confidence = "High" | "Medium" | "Low";

export interface SoilInput { ph: number | null; clayPct: number | null; sandPct: number | null; siltPct: number | null }
export interface MonthClimate { month: number; temperatureMeanC: number | null; precipitationMm: number | null }

/** "high" = inside a validated high-salinity-risk zone (e.g. exposed Aral Sea seabed). */
export type SalinityRisk = "high" | "standard";

export interface EngineInput {
  soil: SoilInput | null;
  /** 12-month climatology from the historical weather service, or null when unavailable. */
  climate: MonthClimate[] | null;
  irrigation: Irrigation;
  plantingMonth: number | null;
  /** Lab-measured soil salinity ECe (dS/m, saturation extract). Null = not assessed — never inferred. */
  salinityEce: number | null;
  salinityRisk: SalinityRisk;
  /** Exact-coordinate administrative evidence, resolved through the shared fail-closed resolver. */
  location?: CalendarLocation | null;
  waterQuality?: "fresh" | "saline" | "unknown" | null;
  drainage?: "yes" | "no" | "unknown" | null;
}

export interface FactorResult {
  key: FactorKey | SoilFactorKey;
  label: string;
  weight: number;
  status: "scored" | "unavailable";
  score: number | null; // 0..1
  detail: string;
  validation: string;
  sources: string[];
  zoneResolution?: ZoneResolution;
}

export interface CropResult {
  slug: string;
  name: string;
  nameUz: string;
  score: number | null;
  level: Level;
  confidence: Confidence;
  completeness: number; // % of weight with data + verified rule
  factors: FactorResult[];
  reasons: string[];
  limitations: string[];
  needsVerification: string[];
  water: string;
  season: { months: number[]; precipitationMm: number | null; meanTemperatureC: number | null } | null;
  sources: string[];
  rank: number;
  rankReason: string;
  /** Legacy rows lack diagnostics; new rows retain the complete policy decision in crops JSON. */
  diagnostics?: {
    baseScore: number | null;
    uncertaintyAdjustedScore: number;
    uncertaintyPenalty: number;
    availableFactors: (FactorKey | SoilFactorKey)[];
    missingFactors: (FactorKey | SoilFactorKey)[];
    riskCaps: RiskCap[];
    effectiveSeasonalRainfallMm: number | null;
    seasonalWaterRequirementMm: number | null;
    rainfedWaterRatio: number | null;
    policy: Record<string, number>;
    rulesVersion: string;
    soilPolicy?: { phWeight: number; textureWeight: number; phDeclineSpan: number; textureMismatchScore: number; highSalinityWithoutLabCap: number; zeroSalinityToleranceCap: number };
    salinitySafetyMultiplier?: number;
  };
  scoreCap: number | null;
}

const LABELS: Record<FactorKey, string> = {
  ph: "Soil pH", texture: "Soil texture", temperature: "Historical temperature",
  water: "Season water & irrigation", salinity: "Soil salinity (ECe)", calendar: "Local planting calendar",
};
const r1 = (x: number) => Math.round(x * 10) / 10;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** USDA texture triangle → coarse/medium/fine group. */
export function textureGroup(sand: number, silt: number, clay: number): { cls: string; group: TextureGroup } {
  let cls: string;
  if (silt + 1.5 * clay < 15) cls = "sand";
  else if (silt + 1.5 * clay >= 15 && silt + 2 * clay < 30) cls = "loamy sand";
  else if ((clay >= 7 && clay < 20 && sand > 52 && silt + 2 * clay >= 30) || (clay < 7 && silt < 50 && silt + 2 * clay >= 30)) cls = "sandy loam";
  else if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) cls = "loam";
  else if ((silt >= 50 && clay >= 12 && clay < 27) || (silt >= 50 && silt < 80 && clay < 12)) cls = "silt loam";
  else if (silt >= 80 && clay < 12) cls = "silt";
  else if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) cls = "sandy clay loam";
  else if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) cls = "clay loam";
  else if (clay >= 27 && clay < 40 && sand <= 20) cls = "silty clay loam";
  else if (clay >= 35 && sand > 45) cls = "sandy clay";
  else if (clay >= 40 && silt >= 40) cls = "silty clay";
  else cls = "clay";
  const group: TextureGroup = ["sand", "loamy sand", "sandy loam"].includes(cls) ? "coarse"
    : ["loam", "silt loam", "silt", "sandy clay loam"].includes(cls) ? "medium" : "fine";
  return { cls, group };
}

/** Monthly temperature score 0..1 against a rule (linear between optimum and limit). */
export function tempScore(t: number, rule: TemperatureRule): number {
  const [lo, hi] = rule.optimum;
  if ((lo === null || t >= lo) && (hi === null || t <= hi)) return 1;
  if (lo !== null && t < lo) return rule.lowerLimit === null ? 0.5 : clamp01((t - rule.lowerLimit) / (lo - rule.lowerLimit));
  if (hi !== null && t > hi) return rule.upperLimit === null ? 0.5 : clamp01((rule.upperLimit - t) / (rule.upperLimit - hi));
  return 1;
}

export function seasonMonths(plantingMonth: number, days: [number, number]): number[] {
  const n = Math.max(1, Math.ceil((days[0] + days[1]) / 2 / 30.4));
  return Array.from({ length: n }, (_, i) => ((plantingMonth - 1 + i) % 12) + 1);
}

const SENS_BASE = { low: 0.7, "low-medium": 0.6, "medium-high": 0.45, high: 0.35 } as const;

function assessOne(p: CropSuitabilityProfile, input: EngineInput, zone: ZoneResolution): Omit<CropResult, "rank" | "rankReason"> {
  const factors: FactorResult[] = [];
  const reasons: string[] = [];
  const limitations: string[] = [...p.limitations];
  const needsVerification: string[] = [];
  const unavailable = (key: FactorKey, detail: string, validation = "unverified") =>
    factors.push({ key, label: LABELS[key], weight: WEIGHTS[key], status: "unavailable", score: null, detail, validation, sources: [] });

  // pH
  const ph = input.soil?.ph ?? null;
  if (!p.ph.value || p.ph.validation === "unverified") unavailable("ph", p.ph.note);
  else if (ph === null) unavailable("ph", "No SoilGrids pH estimate for this point.", p.ph.validation);
  else {
    const [lo, hi] = p.ph.value;
    const s = ph >= lo && ph <= hi ? 1 : clamp01(1 - (ph < lo ? lo - ph : ph - hi) / 1.0);
    factors.push({ key: "ph", label: LABELS.ph, weight: WEIGHTS.ph, status: "scored", score: s, validation: p.ph.validation, sources: p.ph.sources,
      detail: `Estimated topsoil pH ${ph} vs preferred ${lo}–${hi}${s < 1 ? " (score falls to 0 one pH unit outside the range — AgroAI rule)" : ""}.` });
    (s >= 0.8 ? reasons : limitations).push(s >= 0.8 ? `Soil pH ${ph} is within the preferred ${lo}–${hi}.` : `Soil pH ${ph} is outside the preferred ${lo}–${hi}.`);
  }

  // Texture
  const sl = input.soil;
  if (!p.texture.value || p.texture.validation === "unverified") unavailable("texture", p.texture.note);
  else if (!sl || sl.sandPct === null || sl.siltPct === null || sl.clayPct === null) unavailable("texture", "No SoilGrids sand/silt/clay estimate for this point.", p.texture.validation);
  else {
    const { cls, group } = textureGroup(sl.sandPct, sl.siltPct, sl.clayPct);
    const ok = p.texture.value.includes(group);
    factors.push({ key: "texture", label: LABELS.texture, weight: WEIGHTS.texture, status: "scored", score: ok ? 1 : 0.3, validation: p.texture.validation, sources: p.texture.sources,
      detail: `Estimated topsoil texture: ${cls} (${group}); preferred: ${p.texture.value.join("/")}.` });
    (ok ? reasons : limitations).push(ok ? `Topsoil texture (${cls}) matches the crop's preference.` : `Topsoil texture (${cls}) is heavier than preferred — drainage may be a problem.`);
  }

  let tempMinZero = false;
  // Planting calendar (FAO Crop Calendar, Uzbekistan, zone-level)
  const cal = p.calendar.value;
  let calSession: CalendarSession | null = null;
  let calDetail: string | null = null;
  let calScore: number | null = null;
  const calValidation = p.calendar.validation;
  if (cal && p.calendar.validation !== "unverified" && input.plantingMonth && zone.status === "verified" && zone.zoneId) {
    const candidates = cal.filter((c) => c.zones.includes(zone.zoneId ?? ""));
    const fmt = (c: CalendarSession) => `${MONTHS[c.sowFrom[0] - 1]} ${c.sowFrom[1]}–${MONTHS[c.sowTo[0] - 1]} ${c.sowTo[1]} (${c.season.toLowerCase()}, ${c.practice.toLowerCase()})`;
    const scope = `FAO zone ${zone.zoneId} (${UZ_AEZ.find((z) => z.id === zone.zoneId)?.name ?? ""}); district identity ${zone.canonicalUnit}`;
    if (!candidates.length) {
      calDetail = `FAO Crop Calendar lists no ${p.name.toLowerCase()} season for ${scope}.`;
    } else {
      const selectedMonth = input.plantingMonth;
      const best = candidates.map((c) => ({ c, d: monthDistance(selectedMonth, c) })).sort((a, b) => a.d - b.d)[0];
      if (best) {
        calScore = best.d === 0 ? 1 : best.d === 1 ? CALENDAR_NEAR_SCORE : 0;
        if (best.d === 0) calSession = best.c;
      }
      calDetail = `Chosen month ${MONTHS[input.plantingMonth - 1]} vs FAO sowing windows for ${scope}: ${candidates.map(fmt).join("; ")}.`;
    }
  }

  // Season — FAO local growing period when the chosen month falls in a local sowing window.
  const days = calSession ? calSession.growingDays : p.growingPeriodDays.validation !== "unverified" ? p.growingPeriodDays.value : null;
  const months = input.plantingMonth && days ? seasonMonths(input.plantingMonth, days) : null;
  const clim = input.climate;
  const monthRows = months && clim ? months.map((m) => clim.find((c) => c.month === m) ?? null) : null;
  const temps = monthRows?.map((c) => c?.temperatureMeanC ?? null) ?? null;
  const precs = monthRows?.map((c) => c?.precipitationMm ?? null) ?? null;
  const tempsOk = temps && temps.every((t) => t !== null) ? (temps as number[]) : null;
  const precOk = precs && precs.every((x) => x !== null) ? (precs as number[]) : null;
  const seasonP = precOk ? r1(precOk.reduce((a, b) => a + b, 0)) : null;
  const seasonPe = precOk ? r1(precOk.reduce((a, b) => a + effectiveRainfall(b), 0)) : null;
  const seasonT = tempsOk ? r1(tempsOk.reduce((a, b) => a + b, 0) / tempsOk.length) : null;
  const firstMonth = months?.[0], lastMonth = months?.[months.length - 1];
  const span = firstMonth && lastMonth ? `${MONTHS[firstMonth - 1]}–${MONTHS[lastMonth - 1]}` : "";

  // Temperature
  const rule = p.temperature.value;
  if (!rule || p.temperature.validation === "unverified") unavailable("temperature", p.temperature.note);
  else if (!months) unavailable("temperature", "Planting month not given — the growing season cannot be placed.", p.temperature.validation);
  else if (!tempsOk) unavailable("temperature", "Historical monthly temperature is unavailable for this season.", p.temperature.validation);
  else {
    const per = tempsOk.map((t) => tempScore(t, rule));
    tempMinZero = Math.min(...per) === 0;
    const s = 0.5 * (per.reduce((a, b) => a + b, 0) / per.length) + 0.5 * Math.min(...per);
    factors.push({ key: "temperature", label: LABELS.temperature, weight: WEIGHTS.temperature, status: "scored", score: s, validation: p.temperature.validation, sources: p.temperature.sources,
      detail: `2016–2025 monthly means for ${span}: ${tempsOk.map((t) => r1(t)).join(", ")} °C. Score = half the average month score + half the worst month.` });
    const worst = tempsOk[per.indexOf(Math.min(...per))] ?? tempsOk[0] ?? 0;
    if (Math.min(...per) === 0) limitations.push(`At least one month (${r1(worst)} °C) is at or beyond the crop's temperature limit — score capped at Low suitability.`);
    if (s >= 0.75) reasons.push(`Historical temperatures ${span} (avg ${seasonT} °C) suit this crop.`);
    else limitations.push(`Some months in ${span} are outside the crop's temperature range (e.g. ${r1(worst)} °C).`);
  }

  // Water
  const need = p.waterNeedMm.validation !== "unverified" ? p.waterNeedMm.value : null;
  const needMid = need ? (need[0] + need[1]) / 2 : null;
  const sens = p.droughtSensitivity.value;
  let water: string;
  if (!need || needMid === null || !sens || p.droughtSensitivity.validation === "unverified") {
    unavailable("water", "A supported crop water requirement or drought-sensitivity rule is unavailable.");
    water = "Seasonal water requirements cannot be assessed from the supported profile.";
  } else if (input.irrigation === "unknown") {
    unavailable("water", "Irrigation availability unknown — AgroAI never assumes irrigation.", "verified");
    water = `Needs ${need[0]}–${need[1]} mm over the season. Tell us whether irrigation is available.`;
  } else if (!months) {
    unavailable("water", "Planting month not given — seasonal rainfall cannot be calculated.", "verified");
    water = `Needs ${need[0]}–${need[1]} mm over the season.`;
  } else if (seasonP === null || seasonPe === null) {
    unavailable("water", "Historical monthly precipitation unavailable for this season.", "verified");
    water = `Needs ${need[0]}–${need[1]} mm over the season.`;
  } else {
    // Only effective rainfall (FAO Manual 3 §4.2) in the crop's own season counts — never annual totals.
    const cover = clamp01(seasonPe / needMid);
    let s: number;
    if (input.irrigation === "reliable") s = IRRIGATION_BASE_CREDIT.reliable + (1 - IRRIGATION_BASE_CREDIT.reliable) * cover;
    else if (input.irrigation === "limited") s = SENS_BASE[sens] + (1 - SENS_BASE[sens]) * cover;
    else s = cover;
    factors.push({ key: "water", label: LABELS.water, weight: WEIGHTS.water, status: "scored", score: s, validation: "interpretation", sources: p.waterNeedMm.sources.concat(p.droughtSensitivity.sources, ["fao_manual3_ch4"]),
      detail: `Crop water need ${need[0]}–${need[1]} mm; 10-yr average precipitation ${span}: ${seasonP} mm total, ${seasonPe} mm effective (FAO formula, per month); irrigation (user-declared): ${input.irrigation}; drought sensitivity: ${sens}. Irrigation credit and drought-sensitivity bases are AgroAI rules.` });
    water = `Crop needs about ${need[0]}–${need[1]} mm over ${days?.[0]}–${days?.[1]} days. Average precipitation ${span} is ${seasonP} mm, of which about ${seasonPe} mm is effective — `
      + (seasonPe >= need[0] ? "it may cover much of the need." : `a gap of roughly ${Math.round(need[0] - seasonPe)}–${Math.round(need[1] - seasonPe)} mm must come from irrigation.`);
    if (input.irrigation === "reliable") {
      reasons.push("Reliable irrigation reported — can supply the water gap if allocations allow.");
      limitations.push("Irrigation is as reported: water quantity, irrigation-water quality and drainage are not verified.");
    } else if (s >= 0.75) reasons.push(`Effective season rainfall (${seasonPe} mm) is close to the crop's need.`);
    else limitations.push(input.irrigation === "rainfed"
      ? `Rain-fed only: season precipitation (${seasonP} mm) is well below the ${need[0]}–${need[1]} mm need.`
      : `Limited irrigation is a risk for a crop with ${sens} drought sensitivity.`);
  }
  water += ` ${p.irrigationNote}`;

  // Salinity — scored ONLY from an actual ECe measurement; never inferred from other soil properties.
  const tol = p.salinityTolerance.value;
  const ece = input.salinityEce;
  const highRisk = input.salinityRisk === "high";
  if (!tol || p.salinityTolerance.validation === "unverified") {
    unavailable("salinity", p.salinityTolerance.note);
  } else if (ece === null) {
    unavailable("salinity", highRisk
      ? "Validated high-salinity-risk classification; no laboratory ECe provided. Salinity is NOT measured. A conservative preliminary cap applies; this is not a crop recommendation."
      : "No soil salinity measurement (ECe) available. SoilGrids does not measure salinity, and AgroAI never infers it from pH, texture, nitrogen, CEC or organic carbon. A lab salinity test is needed to score this factor.", "verified");
  } else {
    // Maas–Hoffman: full score up to the threshold, then linear decline to 0 at 100% yield loss.
    const s = ece <= tol.thresholdEce ? 1 : clamp01(1 - (tol.slopePctPerDs * (ece - tol.thresholdEce)) / 100);
    factors.push({ key: "salinity", label: LABELS.salinity, weight: WEIGHTS.salinity, status: "scored", score: s, validation: p.salinityTolerance.validation, sources: p.salinityTolerance.sources,
      detail: `Lab-measured soil salinity ECe ${ece} dS/m vs ${p.name} threshold ${tol.thresholdEce} dS/m (yield falls ${tol.slopePctPerDs}% per dS/m above it — Maas–Hoffman, international values, not Uzbekistan-specific).` });
    (s >= 0.8 ? reasons : limitations).push(s >= 0.8
      ? `Measured soil salinity (ECe ${ece} dS/m) is within this crop's tolerance.`
      : `Measured soil salinity (ECe ${ece} dS/m) exceeds this crop's ${tol.thresholdEce} dS/m threshold — expect yield losses without reclamation and leaching.`);
  }
  if (!cal || p.calendar.validation === "unverified") unavailable("calendar", p.calendar.note);
  else if (!input.plantingMonth) unavailable("calendar", "Planting month not given.", p.calendar.validation);
  else if (zone.status !== "verified") unavailable("calendar", zone.reason);
  else if (calScore === null) unavailable("calendar", calDetail ?? "No verified local sowing window available.", calValidation);
  else {
    factors.push({ key: "calendar", label: LABELS.calendar, weight: WEIGHTS.calendar, status: "scored", score: calScore, validation: calValidation, sources: p.calendar.sources, detail: calDetail ?? "" });
    if (calScore === 1) reasons.push(`Planting month is within the FAO sowing window for this area${calValidation === "verified" ? "" : " (preliminary — zone not uniquely matched)"}.`);
    else limitations.push(`Planting in ${MONTHS[input.plantingMonth - 1]} is ${calScore > 0 ? "about a month" : "well"} outside the FAO sowing windows for this area.`);
    if (calValidation !== "verified") needsVerification.push("Planting calendar: farm district was not matched to a single FAO zone — the sowing window check is preliminary.");
  }
  const calendarFactor = factors.find((f) => f.key === "calendar");
  if (calendarFactor) calendarFactor.zoneResolution = zone;

  for (const f of factors) if (f.status === "unavailable") needsVerification.push(`${f.label}: ${f.detail}`);
  needsVerification.push("Crop thresholds use international FAO guidance; only the FAO zone sowing calendar is Uzbekistan-specific, and none are validated by an Uzbek agronomic authority.");

  const scored = factors.filter((f) => f.status === "scored");
  const wSum = scored.reduce((a, f) => a + f.weight, 0);
  const completeness = wSum; // weights total 100
  const location = input.location;
  const validLocation = location?.countryCode === "UZ" && typeof location.latitude === "number" && typeof location.longitude === "number"
    && Number.isFinite(location.latitude) && Number.isFinite(location.longitude) && isInsideUzbekistan(location.latitude, location.longitude);
  const usableInput = scored.length > 0 || input.plantingMonth !== null && Number.isInteger(input.plantingMonth) && input.plantingMonth >= 1 && input.plantingMonth <= 12 || input.irrigation !== "unknown"
    || !!input.soil && Object.values(input.soil).some((v) => v !== null && Number.isFinite(v));
  const baseScore = wSum > 0 ? scored.reduce((a, f) => a + f.weight * (f.score ?? 0), 0) / wSum * 100 : null;
  const adjusted = uncertaintyScore(baseScore, completeness);
  const riskCaps: RiskCap[] = [];
  const cap = (key: string, value: number, reason: string) => riskCaps.push({ key, cap: value, reason });
  if (completeness < FALLBACK_POLICY.lowCoverageThreshold) cap("low_coverage", FALLBACK_POLICY.lowCoverageCap, "Less than 50% weighted data coverage.");
  else if (completeness <= FALLBACK_POLICY.moderateCoverageThreshold) cap("moderate_coverage", FALLBACK_POLICY.moderateCoverageCap, "50–70% weighted data coverage.");
  const hasTemp = scored.some((f) => f.key === "temperature"), hasWater = scored.some((f) => f.key === "water");
  if (seasonT === null && seasonP === null) cap("missing_climate", FALLBACK_POLICY.missingClimateCap, "No usable seasonal climate evidence; climate is unknown, not verified aridity.");
  else if (!hasTemp || !hasWater) cap("missing_critical_factor", FALLBACK_POLICY.missingCriticalFactorCap, "Temperature or seasonal water fit is unavailable.");
  const rainfedRatio = input.irrigation === "rainfed" && seasonPe !== null && needMid !== null && hasWater ? seasonPe / needMid : null;
  if (rainfedRatio !== null && rainfedRatio < FALLBACK_POLICY.severeRainfedRatio) cap("severe_rainfed_deficit", FALLBACK_POLICY.severeRainfedCap, "Verified effective seasonal rainfall is below 25% of this crop's seasonal water requirement.");
  else if (rainfedRatio !== null && rainfedRatio < FALLBACK_POLICY.limitedRainfedRatio) cap("rainfed_deficit", FALLBACK_POLICY.limitedRainfedCap, "Verified effective seasonal rainfall is 25–50% of this crop's seasonal water requirement.");
  if (tempMinZero) cap("temperature_limit", FALLBACK_POLICY.temperatureLimitCap, "A seasonal monthly mean reaches a supported crop temperature limit.");
  const salinityUnverifiedHighRisk = highRisk && input.salinityEce === null;
  if (salinityUnverifiedHighRisk) cap("high_salinity_without_lab", FALLBACK_POLICY.highSalinityWithoutLabCap, "Validated high salinity risk without laboratory ECe; no definitive recommendation.");
  const salinityFactor = scored.find((f) => f.key === "salinity");
  if (salinityFactor?.score === 0) cap("measured_extreme_salinity", FALLBACK_POLICY.zeroSalinityToleranceCap, "Laboratory ECe reaches this crop's zero-tolerance screening score.");
  const scoreCap = riskCaps.length ? Math.min(...riskCaps.map((c) => c.cap)) : null;
  const score = validLocation && usableInput ? Math.round(Math.max(0, Math.min(100, adjusted, scoreCap ?? 100))) : null;
  for (const c of riskCaps) limitations.push(`Preliminary score cap ${c.cap}/100: ${c.reason} Product screening policy, not an official agronomic threshold.`);
  if (completeness < 100) limitations.push(`Missing factors stay unmeasured. Uncertainty policy shrinks the available-factor average towards at most ${FALLBACK_POLICY.unknownWeightAllowance}/100 for uncovered weight; this is a policy allowance, not a measurement.`);
  if (score === null) limitations.push(validLocation ? "No usable assessment inputs were provided." : "A valid Uzbekistan location is required to calculate a score.");
  const level: Level = score === null ? "Insufficient data"
    : score >= LEVEL_THRESHOLDS.potentially ? "Potentially suitable"
    : score >= LEVEL_THRESHOLDS.moderately ? "Moderately suitable" : "Low suitability";
  if (salinityUnverifiedHighRisk) {
    limitations.push("Soil salinity not verified: validated high-risk classification. Numeric scores are conservative preliminary screening only, not recommendations. Laboratory ECe, irrigation-water quality and drainage assessment are needed.");
    needsVerification.push("Laboratory soil salinity test (ECe, saturation extract), irrigation-water salinity (ECw) and drainage assessment — required before any reliable crop ranking here.");
  } else if (input.salinityEce === null) {
    needsVerification.push("Soil salinity (ECe) is not assessed — treat this ranking as preliminary until a lab salinity test is done.");
  }
  // High is not reachable: soil is model-estimated and profiles are not locally validated.
  // Medium additionally requires salinity to be actually assessed (not just the field present).
  const salinityScored = scored.some((f) => f.key === "salinity");
  const irrigationVerified = input.irrigation === "rainfed";
  const confidence: Confidence = score !== null && completeness >= 80 && salinityScored && zone.status === "verified" && irrigationVerified && input.plantingMonth && !salinityUnverifiedHighRisk ? "Medium" : "Low";
  const sources = Array.from(new Set(scored.flatMap((f) => f.sources).concat(p.growingPeriodDays.sources)));

  return { slug: p.slug, name: p.name, nameUz: p.nameUz, score, level, confidence, completeness, factors, reasons, limitations, needsVerification, water,
    season: months ? { months, precipitationMm: seasonP, meanTemperatureC: seasonT } : null, sources, scoreCap,
    diagnostics: { baseScore, uncertaintyAdjustedScore: adjusted, uncertaintyPenalty: baseScore === null ? 0 : baseScore - adjusted,
      availableFactors: scored.map((f) => f.key), missingFactors: factors.filter((f) => f.status === "unavailable").map((f) => f.key),
      riskCaps, effectiveSeasonalRainfallMm: seasonPe, seasonalWaterRequirementMm: needMid, rainfedWaterRatio: rainfedRatio,
      policy: FALLBACK_POLICY, rulesVersion: RULES_VERSION } };
}

export interface SalinitySummary {
  riskZone: boolean;
  assessed: boolean;
  eceDsPerM: number | null;
  /** Prominent warning for the results page, or null. */
  warning: string | null;
}

export function assessCrops(input: EngineInput): { profileVersion: string; rulesVersion: string; weights: typeof WEIGHTS; salinity: SalinitySummary; crops: CropResult[]; zoneResolution: ZoneResolution } {
  const zoneResolution = resolveCalendarZone(input.location);
  const raw = CROP_PROFILES.map((p) => assessOne(p, input, zoneResolution));
  raw.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.completeness - a.completeness || a.name.localeCompare(b.name));
  const crops: CropResult[] = raw.map((c, i) => {
    let rankReason: string;
    if (c.score === null) rankReason = "Not ranked by score: too few verified factors with data.";
    else {
      const next = raw[i + 1];
      const prev = raw[i - 1];
      const cmp = (o: typeof c) => {
        const diffs = c.factors.filter((f) => f.status === "scored").map((f) => {
          const of = o.factors.find((x) => x.key === f.key);
          return { f, d: of?.status === "scored" && f.score !== null && of.score !== null ? f.score - of.score : null };
        }).filter((x): x is { f: FactorResult; d: number } => x.d !== null).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
        const strongest = diffs[0];
        return strongest && Math.abs(strongest.d) > 0.05 ? `${strongest.f.label.toLowerCase()} (${strongest.d > 0 ? "better" : "worse"} fit)` : "the combination of factor coverage, uncertainty and risk caps";
      };
      rankReason = i === 0 ? (next?.score != null ? `Ranked first: ahead of ${next.name} mainly on ${cmp(next)}.` : "Ranked first: the only crop with enough verified data.")
        : prev ? c.score === prev.score
          ? `Same preliminary score as ${prev.name}; display order is not evidence of greater suitability.`
          : `Below ${prev.name} mainly on ${cmp(prev)}.` : "Preliminary screening only.";
    }
    return { ...c, rank: i + 1, rankReason };
  });
  const salinity: SalinitySummary = {
    riskZone: input.salinityRisk === "high",
    assessed: input.salinityEce !== null,
    eceDsPerM: input.salinityEce,
    warning: input.salinityRisk === "high" && input.salinityEce === null
      ? "Soil salinity not verified. Validated high-salinity-risk classification: preliminary scores are capped at 40/100 with Low confidence, not recommendations. Laboratory ECe, irrigation-water quality and drainage assessment are needed. Automatic seabed screening covers only part of the former Aral Sea."
      : input.salinityEce === null
        ? "Soil salinity not verified. SoilGrids does not measure salinity and AgroAI never infers it from other soil properties. Treat this ranking as preliminary until a lab salinity test (ECe) is done."
        : null,
  };
  return { profileVersion: PROFILE_VERSION, rulesVersion: RULES_VERSION, weights: WEIGHTS, salinity, crops, zoneResolution };
}
