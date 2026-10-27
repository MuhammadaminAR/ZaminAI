/**
 * Domain model. Mirrors the future database entities:
 * users, farms, farm_locations, soil_analyses, weather_analyses,
 * crop_recommendations, crop_profiles, subscriptions, analysis_requests.
 *
 * All values in this demo are generated locally and are NOT real measurements.
 */

export type PlanId = "free" | "professional" | "premium";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: "farmer" | "consultant" | "admin" | "super_admin";
  plan: PlanId;
  createdAt: string;
}

export interface FarmLocation {
  id: string;
  lat: number;
  lng: number;
  /** Display label from reverse geocoding; "Location needs review" when unresolved. */
  region: string;
  country?: string | null;
  countryCode?: string | null;
  district?: string | null;
  locality?: string | null;
  formattedAddress?: string | null;
  locationStatus?: "resolved" | "needs_review";
  /** Manual high-salinity-risk flag (e.g. exposed Aral seabed outside the screening polygon). */
  salinityRiskOverride?: "high" | "standard" | null;
}

export interface Farm {
  id: string;
  userId: string;
  name: string;
  areaHectares: number;
  location: FarmLocation;
  createdAt: string;
}

export interface SoilAnalysis {
  ph: number;
  nitrogenPct: number;
  organicCarbonPct: number;
  clayPct: number;
  sandPct: number;
  siltPct: number;
}

/** SoilGrids 2.0 estimate (0-5cm, Q0.5). null = no data, never zero. */
export interface SoilEstimate {
  ph: number | null;
  nitrogenGPerKg: number | null;
  clayPct: number | null;
  sandPct: number | null;
  siltPct: number | null;
  organicCarbonGPerKg: number | null;
  cecCmolPerKg: number | null;
}

export type SoilSource = "soilgrids" | "demo";

export interface WeatherAnalysis {
  annualRainfallMm: number;
  avgTemperatureC: number;
  waterAvailability: "Low" | "Moderate" | "Good";
  growingSeasonDays: number;
}

export interface CropRecommendation {
  cropId: string;
  cropName: string;
  score: number;
  level: "Excellent" | "Good" | "Moderate" | "Poor";
  reasons: string[];
  limitations: string[];
  summary: string;
}

export type AnalysisStatus = "queued" | "processing" | "complete" | "partial" | "failed";

export interface RealWeatherForecastDay {
  date: string;
  temperature_min_c: number | null;
  temperature_max_c: number | null;
  precipitation_mm: number | null;
  rain_mm: number | null;
  precipitation_probability_percent: number | null;
  et0_mm: number | null;
}

/** Open-Meteo weather saved with an analysis. null = no data, never zero. */
export interface RealWeather {
  source: "Open-Meteo";
  latitude: number;
  longitude: number;
  timezone: string;
  fetchedAt: string | null;
  current: {
    temperatureC: number | null;
    relativeHumidityPct: number | null;
    precipitationMm: number | null;
    rainMm: number | null;
    windSpeedKmh: number | null;
    weatherCode: number | null;
  };
  forecast: RealWeatherForecastDay[];
}

/** null = analysis created before the real integrations (legacy demo values). */
export type ServiceStatus = "success" | "no_data" | "error" | "demo" | null;

export interface Analysis {
  id: string;
  userId: string;
  farmId: string | null;
  farmName: string;
  location: FarmLocation;
  status: AnalysisStatus;
  createdAt: string;
  soil: SoilAnalysis;
  soilSource: SoilSource;
  soilEstimate: SoilEstimate | null;
  soilStatus: ServiceStatus;
  weather: WeatherAnalysis;
  weatherStatus: "success" | "error" | null;
  realWeather: RealWeather | null;
  suitabilityScore: number;
  recommendations: CropRecommendation[];
}

export interface CropProfile {
  id: string;
  name: string;
  emoji: string;
  phRange: [number, number];
  rainfallRangeMm: [number, number];
  tempRangeC: [number, number];
  preferredClayPct: [number, number];
  note: string;
}
