export interface GeoResult {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** Named coordinates so latitude/longitude can never be swapped positionally. */
export interface Coords {
  latitude: number;
  longitude: number;
}

/** Geographic identity resolved from coordinates by Mapbox reverse geocoding. */
export interface GeoLocation {
  latitude: number;
  longitude: number;
  country: string | null;
  countryCode: string | null; // ISO 3166-1 alpha-2, uppercase
  region: string | null;
  district: string | null;
  locality: string | null;
  formattedAddress: string | null;
  source: "mapbox_reverse_geocoding";
}

export const SUPPORTED_COUNTRY_CODE = "UZ";

/** Official English names for Uzbek regions, keyed by the ISO 3166-2 code Mapbox returns. */
const UZ_REGION_NAMES: Record<string, string> = {
  "UZ-AN": "Andijan region",
  "UZ-BU": "Bukhara region",
  "UZ-FA": "Fergana region",
  "UZ-JI": "Jizzakh region",
  "UZ-NG": "Namangan region",
  "UZ-NW": "Navoiy region",
  "UZ-QA": "Kashkadarya region",
  "UZ-QR": "Republic of Karakalpakstan",
  "UZ-SA": "Samarkand region",
  "UZ-SI": "Sirdaryo region",
  "UZ-SU": "Surkhandarya region",
  "UZ-TK": "Tashkent city",
  "UZ-TO": "Tashkent region",
  "UZ-XO": "Khorezm region",
};

function token() {
  const t = import.meta.env["VITE_MAPBOX_PUBLIC_TOKEN"] as string | undefined;
  if (!t) throw new Error("Mapbox token missing");
  return t;
}

export function isValidCoords({ latitude, longitude }: Coords) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function isSupported(geo: GeoLocation | null) {
  return geo?.countryCode === SUPPORTED_COUNTRY_CODE;
}

/** Browser-side Mapbox forward geocoding using the public (pk.) token. */
export async function searchPlaces(q: string): Promise<GeoResult[]> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?limit=6&language=en&proximity=64.6,41.3&access_token=${token()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed [${res.status}]`);
  const json = (await res.json()) as {
    features: { id: string; place_name: string; center: [number, number] }[];
  };
  // Mapbox `center` is [longitude, latitude]
  return json.features.map((f) => ({ id: f.id, name: f.place_name, lng: f.center[0], lat: f.center[1] }));
}

type Feature = {
  place_type: string[];
  text: string;
  place_name: string;
  properties?: { short_code?: string };
};

/** Reverse geocode exact coordinates. Mapbox expects `longitude,latitude` in the path. */
export async function reverseGeocode({ latitude, longitude }: Coords): Promise<GeoLocation> {
  if (!isValidCoords({ latitude, longitude })) throw new Error("Invalid coordinates");
  const path = `${longitude},${latitude}`;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${path}.json?language=en&types=country,region,district,place,locality&access_token=${token()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Reverse geocoding failed [${res.status}]`);
  const json = (await res.json()) as { features?: Feature[] };
  const features = json.features ?? [];
  const find = (t: string) => features.find((f) => f.place_type.includes(t));
  const country = find("country");
  const region = find("region");
  const countryCode = country?.properties?.short_code?.toUpperCase() ?? null;
  const regionCode = region?.properties?.short_code?.toUpperCase();
  const regionName =
    countryCode === "UZ" && regionCode && UZ_REGION_NAMES[regionCode]
      ? UZ_REGION_NAMES[regionCode]
      : (region?.text ?? null);
  return {
    latitude,
    longitude,
    country: country?.text ?? null,
    countryCode,
    region: regionName,
    district: find("district")?.text ?? null,
    locality: (find("place") ?? find("locality"))?.text ?? null,
    formattedAddress: features[0]?.place_name ?? null,
    source: "mapbox_reverse_geocoding",
  };
}
