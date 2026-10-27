import { UZ_AEZ } from "./profiles";

export const ZONE_MAPPING_VERSION = "uz-fao-zone-mapping-v1";
export interface CalendarLocation {
  countryCode?: string | null;
  region?: string | null;
  district?: string | null;
  locality?: string | null;
  source?: string | null;
  status?: string | null;
  latitude?: number;
  longitude?: number;
}
export interface ZoneResolution {
  version: string;
  status: "verified" | "unavailable";
  zoneId: string | null;
  canonicalUnit: string | null;
  regionCode: string | null;
  candidateZones: string[];
  reason: string;
  evidence: CalendarLocation | null;
  sources: string[];
}

/** Formatting only: no edit-distance matching, substring matching or guessed transliteration. */
export function normalizeGeographicName(value: string): string {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[‘’ʻʼ'`\u02bb\u02bc]/g, "")
    .replace(/\b(district|tumani|tuman|city|shahri|region|viloyati|province)\b/g, " ")
    .replace(/[\s-]+/g, " ").trim();
}

// ISO 3166-2 region identities. Aliases are explicit; region identity never assigns a zone itself.
const REGIONS: Record<string, string[]> = {
  "UZ-AN": ["Andijan", "Andijon"], "UZ-BU": ["Bukhara", "Buxoro"],
  "UZ-FA": ["Fergana", "Fargana", "Farg'ona"], "UZ-JI": ["Jizzakh", "Jizzax"],
  "UZ-NG": ["Namangan"], "UZ-NW": ["Navoiy", "Navoi"],
  "UZ-QA": ["Kashkadarya", "Qashqadaryo"], "UZ-QR": ["Republic of Karakalpakstan", "Karakalpakstan", "Qoraqalpog'iston"],
  "UZ-SA": ["Samarkand", "Samarqand"], "UZ-SI": ["Sirdaryo", "Sirdarya"],
  "UZ-SU": ["Surkhandarya", "Surxondaryo"], "UZ-TK": ["Tashkent city"],
  "UZ-TO": ["Tashkent", "Toshkent"], "UZ-XO": ["Khorezm", "Xorazm"],
};

// FAO labels linked to administrative regions; keys are internal FAO unit identities, NOT official district codes.
const REGION_UNITS: Record<string, string[]> = {
  "UZ-FA": ["Fargana", "Fergana", "Kukand", "Kokand", "Kuva", "Kuvasay", "Margelan", "Rishtan", "Akhunbabaev"],
  "UZ-AN": ["Andijan", "Asaka", "Karasu", "Kurganteppa", "Marhamat", "Pakhtaabad", "Paytug", "Khanabad", "Khodzjabad", "Shahrikhan"],
  "UZ-NG": ["Kasansay", "Hakulabad", "Pop", "Turakurgan", "Uchkurgan", "Chartak", "Chust"],
  "UZ-TO": ["Tashkent", "Akkurgan", "Akhangaran", "Bekabad", "Bustonlik", "Buka", "Kubray", "Kuichirchik", "Parkent", "Zangit", "Urtachirchik", "Chinaz", "Ukorichirchik", "Yangiul", "Chirchik", "Angren"],
  "UZ-SI": ["Akaltin", "Bayaut", "Guliston", "Gulistan", "Mirzaabad", "Saykhun", "Sirdarya", "Khavast"],
  "UZ-JI": ["Arnas", "Dustlik", "Farish", "Zarbad", "Pakhtakor", "Zafarabad", "Bakhmal", "Gallayar", "Jizzakh", "Mirzohul", "Zamin", "Yangiabad"],
  "UZ-SA": ["Bulungur", "Jambay", "Ishtikhan", "Kattakurgan", "Koshrabat", "Narpay", "Nurabad", "Payariq", "Oqdarya", "Pakhtachi", "Pastargon", "Samarqand", "Samarkand", "Toyloq", "Urgut"],
  "UZ-NW": ["Kanimekh", "Karmana", "Kyzylteppa", "Khatyarchi", "Navbakhor", "Nurata"],
  "UZ-SU": ["Angor", "Bandikhon", "Jarkurgon", "Kizirik", "Kumkurgon", "Muzrabot", "Termez", "Sherobod", "Shurchi", "Sariosiyo", "Denov", "Oltinsoy", "Uzun", "Boysun"],
  "UZ-QA": ["Dehqonobod", "Guzar", "Kamashi", "Karshi", "Qarshi", "Kasby", "Kitob", "Myrishkor", "Muberak", "Nishon", "Chiroqchi", "Shahrisabz", "Yakkabod"],
  "UZ-BU": ["Alat", "Bukhara", "Gujduvan", "Jondor", "Kagan", "Karakul", "Karaubazar", "Peshku", "Romitan", "Shafikan", "Vabkent"],
  "UZ-QR": ["Kungrad", "Muynak", "Takhtakunir", "Amudaryo", "Beruny", "Qaroozak", "Chimboy", "Shimanay", "Tortkol", "Khojayli"],
  "UZ-XO": ["Bogot", "Gurlan", "Xonda", "Xuzorasp", "Khiva", "Qoshkopir", "Shovot", "Urganch", "Urgench", "Yangiariq", "Yangibozor"],
};

const ALIASES: Record<string, string[]> = {
  Akhangaran: ["Okhangaron", "O‘hangaron", "Oʻhangaron", "Ohangaron", "Оҳангарон", "Ахангаран"],
  Chinaz: ["Chinoz"], Urgut: ["Ургут"], Khiva: ["Xiva", "Хива"],
  Angren: ["Ангрен"], Chirchik: ["Chirchiq", "Чирчик"],
  Guliston: ["Гулистон"], Samarkand: ["Самарканд"], Termez: ["Termiz", "Термез"],
  Qarshi: ["Карши"], Bukhara: ["Buxoro", "Бухара"], Muynak: ["Moynaq", "Mo'ynoq", "Муйнак"],
};

/** Positive evidence allowlist. Other FAO labels are audited candidates, not verified identities. */
const VERIFIED_UNITS: Record<string, { labels: string[]; sources: string[] }> = {
  "UZ-TO": { labels: ["Akhangaran", "Chinaz"], sources: ["https://lex.uz/docs/1724098", "https://gov.uz/oz/chinoz/pages/about", "https://gov.uz/oz/toshvil/departments/regional?active=3680"] },
  "UZ-SI": { labels: ["Guliston", "Gulistan"], sources: ["https://gov.uz/oz/gulistontumani/pages/about"] },
  "UZ-SA": { labels: ["Urgut"], sources: ["https://gov.uz/oz/urgut", "https://gov.uz/oz/samarqand/departments/regional"] },
  "UZ-SU": { labels: ["Angor"], sources: ["https://gov.uz/oz/angor/pages/about"] },
  "UZ-QA": { labels: ["Qarshi", "Karshi"], sources: ["https://gov.uz/qashqadaryo/departments/regional?active=1720"] },
  "UZ-BU": { labels: ["Bukhara"], sources: ["https://gov.uz/uz/buxoro/departments/regional"] },
  "UZ-XO": { labels: ["Khiva"], sources: ["https://gov.uz/oz/xorazm/departments/regional"] },
};

export function resolveCalendarZone(location?: CalendarLocation | null): ZoneResolution {
  const result: ZoneResolution = { version: ZONE_MAPPING_VERSION, status: "unavailable", zoneId: null,
    canonicalUnit: null, regionCode: null, candidateZones: [], reason: "Local planting zone could not be verified.",
    evidence: location ?? null, sources: ["fao_cropcalendar_uz"] };
  const fail = (reason: string) => ({ ...result, reason });
  if (!location || location.countryCode !== "UZ" || location.status !== "resolved" || location.source !== "mapbox_reverse_geocoding")
    return fail("Local planting zone could not be verified: resolved Uzbekistan administrative evidence is required.");
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude))
    return fail("Local planting zone could not be verified: exact coordinates are missing.");
  if ((location.latitude ?? 0) < -90 || (location.latitude ?? 0) > 90 || (location.longitude ?? 0) < -180 || (location.longitude ?? 0) > 180)
    return fail("Local planting zone could not be verified: coordinates are invalid.");
  if (!location.district) return fail("Local planting zone could not be verified: district is missing; a nearby locality is not district evidence.");
  if (/\b(city|shahri|shahar)\b|город|шаҳар/i.test(location.district))
    return fail("Local planting zone could not be verified: city evidence must not be substituted for a district.");
  const regionName = normalizeGeographicName(location.region ?? "");
  // Preserve city/region distinction before normalization removes administrative suffixes.
  const region = location.region === "Tashkent city" ? "UZ-TK" : Object.entries(REGIONS)
    .find(([code, names]) => code !== "UZ-TK" && [code, ...names].some((n) => normalizeGeographicName(n) === regionName))?.[0];
  if (!region) return fail("Local planting zone could not be verified: administrative region is unknown.");
  result.regionCode = region;
  const district = normalizeGeographicName(location.district);
  const units = (REGION_UNITS[region] ?? []).filter((u) => [u, ...(ALIASES[u] ?? [])].some((n) => normalizeGeographicName(n) === district));
  const zones = UZ_AEZ.filter((z) => z.units.some((u) => units.includes(u))).map((z) => z.id);
  result.candidateZones = zones;
  result.canonicalUnit = units[0] ? `${region}:fao:${normalizeGeographicName(units[0])}` : null;
  if (zones.length !== 1) return fail(zones.length > 1
    ? `Local planting zone could not be verified: administrative unit is listed in FAO zones ${zones.join("/")}; authoritative sub-district zone boundaries are required.`
    : "Local planting zone could not be verified: no supported FAO administrative mapping for this district and region.");
  const verified = VERIFIED_UNITS[region];
  if (!verified || !units.some((u) => verified.labels.includes(u)))
    return fail("Local planting zone could not be verified: this FAO label still requires an authoritative administrative crosswalk.");
  result.sources.push(...verified.sources);
  return { ...result, status: "verified", zoneId: zones[0] ?? null,
    reason: "Exact-coordinate reverse-geocoded district and region match one FAO-listed zone." };
}