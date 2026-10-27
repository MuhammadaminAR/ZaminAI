import { cropProfiles } from "./crop-profiles";
import type {
  Analysis,
  CropRecommendation,
  FarmLocation,
  SoilAnalysis,
  WeatherAnalysis,
} from "./types";

/**
 * Deterministic mock analysis engine.
 *
 * It produces plausible-looking demo values from the coordinates so the same
 * point always returns the same result. These are NOT measurements. When real
 * soil / weather / satellite providers are connected, replace `generateSoil`,
 * `generateWeather` and `scoreCrops` with API-backed implementations — the
 * rest of the app only depends on the shapes in `types.ts`.
 */

function hash(lat: number, lng: number, salt: number) {
  const x = Math.sin(lat * 127.1 + lng * 311.7 + salt * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

function range(v: number, min: number, max: number) {
  return +(min + v * (max - min)).toFixed(2);
}

export function generateSoil(lat: number, lng: number): SoilAnalysis {
  const clay = range(hash(lat, lng, 3), 8, 45);
  const sand = range(hash(lat, lng, 4), 20, 100 - clay - 5);
  return {
    ph: range(hash(lat, lng, 1), 5.2, 8.4),
    nitrogenPct: range(hash(lat, lng, 2), 0.04, 0.28),
    organicCarbonPct: range(hash(lat, lng, 5), 0.3, 3.2),
    clayPct: clay,
    sandPct: sand,
    siltPct: +(100 - clay - sand).toFixed(2),
  };
}

export function generateWeather(lat: number, lng: number): WeatherAnalysis {
  const rainfall = Math.round(range(hash(lat, lng, 6), 180, 1100));
  return {
    annualRainfallMm: rainfall,
    avgTemperatureC: range(hash(lat, lng, 7), 9, 27),
    waterAvailability: rainfall > 750 ? "Good" : rainfall > 420 ? "Moderate" : "Low",
    growingSeasonDays: Math.round(range(hash(lat, lng, 8), 140, 250)),
  };
}

function fit(value: number, [min, max]: [number, number]) {
  if (value >= min && value <= max) return 1;
  const span = max - min || 1;
  const distance = value < min ? min - value : value - max;
  return Math.max(0, 1 - distance / span);
}

export function scoreCrops(
  soil: SoilAnalysis,
  weather: WeatherAnalysis,
): CropRecommendation[] {
  return cropProfiles
    .map((crop) => {
      const phFit = fit(soil.ph, crop.phRange);
      const rainFit = fit(weather.annualRainfallMm, crop.rainfallRangeMm);
      const tempFit = fit(weather.avgTemperatureC, crop.tempRangeC);
      const clayFit = fit(soil.clayPct, crop.preferredClayPct);
      const nitrogenFit = Math.min(1, soil.nitrogenPct / 0.18);

      const score = Math.round(
        (phFit * 0.25 + rainFit * 0.25 + tempFit * 0.2 + clayFit * 0.15 + nitrogenFit * 0.15) *
          100,
      );

      const reasons: string[] = [];
      const limitations: string[] = [];

      const add = (ok: boolean, good: string, bad: string) =>
        ok ? reasons.push(good) : limitations.push(bad);

      add(phFit > 0.8, `Soil pH ${soil.ph} sits in the preferred range`, `Soil pH ${soil.ph} is outside the preferred range`);
      add(
        rainFit > 0.8,
        `Estimated rainfall ${weather.annualRainfallMm} mm matches typical needs`,
        `Estimated rainfall ${weather.annualRainfallMm} mm may require irrigation planning`,
      );
      add(
        tempFit > 0.8,
        `Average temperature ${weather.avgTemperatureC}°C suits the growing season`,
        `Average temperature ${weather.avgTemperatureC}°C is less favourable`,
      );
      add(
        clayFit > 0.7,
        `Soil texture (${soil.clayPct}% clay) supports healthy roots`,
        `Soil texture (${soil.clayPct}% clay) may limit drainage or rooting`,
      );
      add(
        nitrogenFit > 0.7,
        `Nitrogen level ${soil.nitrogenPct}% is adequate`,
        `Nitrogen level ${soil.nitrogenPct}% is low — fertiliser planning needed`,
      );

      const level: CropRecommendation["level"] =
        score >= 80 ? "Excellent" : score >= 65 ? "Good" : score >= 45 ? "Moderate" : "Poor";

      return {
        cropId: crop.id,
        cropName: crop.name,
        score,
        level,
        reasons: reasons.slice(0, 3),
        limitations: limitations.slice(0, 3),
        summary:
          level === "Excellent" || level === "Good"
            ? `This land looks well suited to ${crop.name.toLowerCase()}. ${crop.note}`
            : `${crop.name} is possible here but would need extra management. ${crop.note}`,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function buildAnalysis(input: {
  id: string;
  userId: string;
  farmId?: string | null;
  farmName: string;
  location: FarmLocation;
}): Analysis {
  const { lat, lng } = input.location;
  const soil = generateSoil(lat, lng);
  const weather = generateWeather(lat, lng);
  const recommendations = scoreCrops(soil, weather);
  const suitabilityScore = Math.round(
    recommendations.slice(0, 3).reduce((sum, r) => sum + r.score, 0) / 3,
  );

  return {
    id: input.id,
    soilSource: "demo",
    soilStatus: null,
    weatherStatus: null,
    realWeather: null,
    soilEstimate: null,
    userId: input.userId,
    farmId: input.farmId ?? null,
    farmName: input.farmName,
    location: input.location,
    status: "complete",
    createdAt: new Date().toISOString(),
    soil,
    weather,
    suitabilityScore,
    recommendations,
  };
}
