/**
 * Crop suitability profiles — v1 (international FAO guidance, NOT locally validated
 * Uzbekistan agronomy). Only parameters quoted from a source are marked "verified";
 * everything else is "unverified" and is never used for scoring.
 *
 * Browser-safe (no server imports) so the results page can show sources.
 */

export const PROFILE_VERSION = "crop-profiles-v3-fao-uz-calendar-2026-10";

export type Validation = "verified" | "interpretation" | "unverified";

export interface Source {
  id: string;
  title: string;
  url: string;
}

export const SOURCES: Record<string, Source> = {
  fao_ecocrop_rice: { id: "fao_ecocrop_rice", title: "FAO EcoCrop — Oryza sativa, optimal soil pH (international screening bands, not Uzbekistan validation)", url: "https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1574" },
  fao_ecocrop_cotton: { id: "fao_ecocrop_cotton", title: "FAO EcoCrop — Gossypium hirsutum, optimal soil pH 6–7.5 (absolute 5–9.5) and optimal texture heavy/medium (international screening bands, not Uzbekistan validation)", url: "https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1160" },
  fao_ecocrop_wheat: { id: "fao_ecocrop_wheat", title: "FAO EcoCrop — Triticum aestivum, optimal soil pH 6–7 (absolute 5.5–8.5) and optimal texture medium/organic (international screening bands, not Uzbekistan validation)", url: "https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2114" },
  fao_ecocrop_maize: { id: "fao_ecocrop_maize", title: "FAO EcoCrop — Zea mays, optimal soil pH 5–7 (absolute 4.5–8.5); no texture entry (international screening bands, not Uzbekistan validation)", url: "https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2175" },
  fao_manual3_ch2: {
    id: "fao_manual3_ch2",
    title: "FAO Irrigation Water Management Training Manual No. 3 — Ch. 2, Table 4 (growing period) & Table 5 (seasonal crop water need)",
    url: "https://www.fao.org/4/s2022e/s2022e02.htm",
  },
  fao_manual3_ch3: {
    id: "fao_manual3_ch3",
    title: "FAO Irrigation Water Management Training Manual No. 3 — Table 14 (crop water need & sensitivity to drought)",
    url: "https://www.fao.org/4/s2022e/s2022e07.htm",
  },
  fao_cotton: { id: "fao_cotton", title: "FAO Land & Water — Cotton", url: "https://www.fao.org/land-water/databases-and-software/crop-information/cotton/en/" },
  fao_wheat: { id: "fao_wheat", title: "FAO Land & Water — Wheat", url: "https://www.fao.org/land-water/databases-and-software/crop-information/wheat/en/" },
  fao_potato: { id: "fao_potato", title: "FAO Land & Water — Potato", url: "https://www.fao.org/land-water/databases-and-software/crop-information/potato/en/" },
  fao_tomato: { id: "fao_tomato", title: "FAO Land & Water — Tomato", url: "https://www.fao.org/land-water/databases-and-software/crop-information/tomato/en/" },
  fao_maize: { id: "fao_maize", title: "FAO Land & Water — Maize", url: "https://www.fao.org/land-water/databases-and-software/crop-information/maize/en/" },
  maas_hoffman: {
    id: "maas_hoffman",
    title: "Maas & Hoffman (1977) / USDA Handbook 60 — crop salt tolerance: ECe threshold (dS/m) and yield decline (% per dS/m), as tabulated in FAO Irrigation & Drainage Paper 29/56",
    url: "https://www.ars.usda.gov/pacific-west-area/riverside-ca/agricultural-water-efficiency-and-salinity-research-unit/docs/databases/fgs-crops/",
  },
  fao_manual3_ch4: {
    id: "fao_manual3_ch4",
    title: "FAO Irrigation Water Management Training Manual No. 3 — Section 4.2, effective rainfall (Pe = 0.8P − 25 if P > 75 mm/month; Pe = 0.6P − 10 if P < 75 mm/month; slopes ≤ 4–5 %)",
    url: "https://www.fao.org/4/s2022e/s2022e08.htm",
  },
  fao_cropcalendar_uz: {
    id: "fao_cropcalendar_uz",
    title: "FAO Crop Calendar — Uzbekistan, by agro-ecological zone (last updated 26/02/2021). No entries for cotton or grain maize.",
    url: "https://cropcalendar.apps.fao.org/#/home?id=UZ",
  },
  gsasmap: {
    id: "gsasmap",
    title: "FAO Global Map of Salt-Affected Soils (GSASmap v1.0) — no public point-lookup API; Uzbekistan coverage unverified; not integrated",
    url: "https://www.fao.org/global-soil-partnership/soil-data/global-map-of-salt-affected-soils-gsasmap/en",
  },
};

/** Maas–Hoffman salt tolerance: ECe threshold (dS/m) above which yield declines, and slope (% yield loss per dS/m above threshold). */
export interface SalinityTolerance {
  thresholdEce: number;
  slopePctPerDs: number;
}

/**
 * FAO Crop Calendar agro-ecological zones for Uzbekistan, with the district names FAO lists
 * for each (as spelled by FAO). Several districts appear in more than one zone.
 */
export const UZ_AEZ: { id: string; name: string; units: string[] }[] = [
  { id: "001", name: "East Coast Plain areas", units: ["Fargana", "Fergana", "Kukand", "Kokand", "Kuva", "Kuvasay", "Margelan", "Rishtan", "Andijan", "Asaka", "Akhunbabaev", "Karasu", "Kurganteppa", "Marhamat", "Pakhtaabad", "Paytug", "Khanabad", "Khodzjabad", "Shahrikhan", "Kasansay", "Hakulabad", "Pop", "Turakurgan", "Uchkurgan", "Chartak", "Chust", "Tashkent", "Akkurgan", "Akhangaran", "Bekabad", "Bustonlik", "Buka", "Kubray", "Kuichirchik", "Parkent", "Zangit", "Urtachirchik", "Chinaz", "Ukorichirchik", "Yangiul"] },
  { id: "002", name: "East Slopes", units: ["Tashkent", "Chirchik"] },
  { id: "003", name: "East Upland", units: ["Angren", "Bustonlik", "Chirchik"] },
  { id: "004", name: "Central Coast Plain areas", units: ["Akaltin", "Bayaut", "Guliston", "Gulistan", "Mirzaabad", "Saykhun", "Sarob", "Sirdarya", "Khavast", "Arnas", "Dustlik", "Farish", "Zarbad", "Pakhtakor", "Zafarabad"] },
  { id: "005", name: "Central Slopes", units: ["Bakhmal", "Gallayar", "Jizzakh", "Mirzohul", "Zamin", "Yangiabad", "Bulungur", "Jambay", "Ishtikhan", "Kattakurgan", "Koshrabat", "Narpay", "Nurabad", "Payariq", "Oqdarya", "Pakhtachi", "Pastargon", "Samarqand", "Samarkand", "Toyloq", "Urgut", "Chiroqchi", "Koson", "Kanimekh", "Karmana", "Kyzylteppa", "Khatyarchi", "Navbakhor", "Nurata"] },
  { id: "006", name: "Southern Coast Plain areas (Surkhandarya)", units: ["Angor", "Bandikhon", "Jarkurgon", "Kizirik", "Kumkurgon", "Muzrabot", "Termez", "Sherobod", "Shurchi"] },
  { id: "007", name: "Southern Coast Plain areas (Kashkadarya)", units: ["Sariosiyo", "Denov", "Oltinsoy", "Uzun", "Boysun", "Kumkurgon", "Dehqonobod", "Guzar", "Kamashi", "Karshi", "Qarshi", "Kasby", "Kitob", "Myrishkor", "Muberak", "Nishon", "Chiroqchi", "Shahrisabz", "Yakkabod"] },
  { id: "008", name: "South-West Coast Plain areas", units: ["Alat", "Bukhara", "Gujduvan", "Jondor", "Kagan", "Karakul", "Karaubazar", "Peshku", "Romitan", "Shafikan", "Vabkent", "Kungrad", "Muynak", "Takhtakunir"] },
  { id: "009", name: "North-West Coast Plain areas", units: ["Bogot", "Gurlan", "Xonda", "Xuzorasp", "Khiva", "Qoshkopir", "Shovot", "Urganch", "Urgench", "Yangiariq", "Yangibozor", "Amudaryo", "Beruny", "Qaroozak", "Chimboy", "Shimanay", "Tortkol", "Khojayli"] },
];

/** One FAO sowing window: sowing from [month, day] to [month, day], growing period in days. */
export interface CalendarSession { zones: string[]; season: string; sowFrom: [number, number]; sowTo: [number, number]; growingDays: [number, number]; practice: string }

export type TextureGroup = "coarse" | "medium" | "fine";
export type DroughtSensitivity = "low" | "low-medium" | "medium-high" | "high";

interface Param<T> {
  value: T | null;
  validation: Validation;
  sources: string[];
  note: string;
}

export interface TemperatureRule {
  /** Monthly mean air temperature (°C) considered optimal. Null bound = open-ended. */
  optimum: [number | null, number | null];
  /** Monthly mean at or beyond which the factor scores 0. Null = no sourced limit. */
  lowerLimit: number | null;
  upperLimit: number | null;
}

export interface CropSuitabilityProfile {
  slug: "cotton" | "wheat" | "potato" | "rice" | "tomato" | "maize";
  name: string;
  nameUz: string;
  ph: Param<[number, number]>;
  texture: Param<TextureGroup[]>;
  temperature: Param<TemperatureRule>;
  waterNeedMm: Param<[number, number]>;
  growingPeriodDays: Param<[number, number]>;
  droughtSensitivity: Param<DroughtSensitivity>;
  salinityTolerance: Param<SalinityTolerance>;
  /** FAO Crop Calendar sowing windows for Uzbekistan (zone-level), or unverified when FAO has no entry. */
  calendar: Param<CalendarSession[]>;
  irrigationNote: string;
  limitations: string[];
  /** No crop parameter has been validated by an Uzbek agronomic authority yet. */
  localValidation: "not_validated";
}

const U = <T,>(note: string): Param<T> => ({ value: null, validation: "unverified", sources: [], note });

export const CROP_PROFILES: CropSuitabilityProfile[] = [
  {
    slug: "cotton", name: "Cotton", nameUz: "Paxta",
    ph: U("No pH range found in the FAO source used; not scored."),
    texture: U("Soil texture preference not stated in the FAO source used; not scored."),
    temperature: {
      value: { optimum: [20, 32], lowerLimit: 14, upperLimit: 38 },
      validation: "interpretation", sources: ["fao_cotton"],
      note: "FAO: early growth needs >20 °C, 27–32 °C optimal for bolls, germination minimum 14 °C, yields reduced above 38 °C, ≥200 frost-free days. Applied by AgroAI to monthly mean temperatures (FAO thresholds are daily).",
    },
    waterNeedMm: { value: [700, 1300], validation: "verified", sources: ["fao_manual3_ch2"], note: "Seasonal crop water need, mm per total growing period." },
    growingPeriodDays: { value: [150, 180], validation: "verified", sources: ["fao_cotton"], note: "FAO cotton page: 150–180 days (Training Manual Table 4 gives 180–195)." },
    droughtSensitivity: { value: "low", validation: "verified", sources: ["fao_manual3_ch3"], note: "" },
    salinityTolerance: { value: { thresholdEce: 7.7, slopePctPerDs: 5.2 }, validation: "verified", sources: ["maas_hoffman"], note: "Cotton is among the most salt-tolerant crops (rating T). International values, not Uzbekistan-specific yield predictions." },
    calendar: U("FAO Crop Calendar for Uzbekistan has no cotton entry; no other machine-usable local calendar sourced — planting month not checked."),
    irrigationNote: "In Uzbekistan cotton is grown almost entirely under irrigation; rainfall alone rarely covers its 700–1300 mm need.",
    limitations: ["Very sensitive to frost — needs about 200 frost-free days (FAO)."],
    localValidation: "not_validated",
  },
  {
    slug: "wheat", name: "Wheat", nameUz: "Bug'doy",
    ph: U("No pH range found in the FAO source used; not scored."),
    texture: U("Soil texture preference not stated in the FAO source used; not scored."),
    temperature: U("Winter vs spring wheat have different temperature/vernalisation needs; no verified monthly rule yet, so not scored."),
    waterNeedMm: { value: [450, 650], validation: "verified", sources: ["fao_manual3_ch2"], note: "Barley/Oats/Wheat group." },
    growingPeriodDays: { value: [120, 150], validation: "verified", sources: ["fao_manual3_ch2"], note: "Spring wheat 100–130 d, winter wheat 180–250 d (FAO wheat page)." },
    droughtSensitivity: { value: "low-medium", validation: "verified", sources: ["fao_manual3_ch3"], note: "" },
    salinityTolerance: { value: { thresholdEce: 6.0, slopePctPerDs: 7.1 }, validation: "verified", sources: ["maas_hoffman"], note: "Wheat is moderately tolerant (MT). International values, not Uzbekistan-specific yield predictions." },
    calendar: { value: [
      { zones: ["001", "004", "009"], season: "Winter", sowFrom: [10, 10], sowTo: [11, 15], growingDays: [215, 218], practice: "Irrigated" },
      { zones: ["002", "005"], season: "Winter", sowFrom: [9, 10], sowTo: [11, 10], growingDays: [250, 270], practice: "Irrigated and rainfed" },
      { zones: ["003"], season: "Spring", sowFrom: [3, 20], sowTo: [4, 20], growingDays: [150, 150], practice: "Rainfed" },
      { zones: ["007"], season: "Winter", sowFrom: [10, 10], sowTo: [11, 15], growingDays: [225, 235], practice: "Irrigated and rainfed" },
    ], validation: "verified", sources: ["fao_cropcalendar_uz"], note: "Bread wheat. FAO calendar lists no wheat season for zones 006 and 008." },
    irrigationNote: "Winter wheat uses autumn–spring precipitation; supplemental irrigation is common in dry areas (FAO).",
    limitations: ["Spring frost during heading/flowering can cause sterility (FAO)."],
    localValidation: "not_validated",
  },
  {
    slug: "potato", name: "Potato", nameUz: "Kartoshka",
    ph: { value: [5, 6], validation: "verified", sources: ["fao_potato"], note: "FAO: well-drained, well-aerated, porous soil with pH 5 to 6." },
    texture: { value: ["coarse", "medium"], validation: "interpretation", sources: ["fao_potato"], note: "FAO 'well-drained, well-aerated, porous soil' mapped by AgroAI to coarse/medium USDA texture classes." },
    temperature: {
      value: { optimum: [18, 20], lowerLimit: 10, upperLimit: 30 },
      validation: "verified", sources: ["fao_potato"],
      note: "FAO: optimum mean daily 18–20 °C; tuber growth sharply inhibited below 10 °C and above 30 °C.",
    },
    waterNeedMm: { value: [500, 700], validation: "verified", sources: ["fao_manual3_ch2"], note: "" },
    growingPeriodDays: { value: [105, 145], validation: "verified", sources: ["fao_manual3_ch2"], note: "" },
    droughtSensitivity: { value: "high", validation: "verified", sources: ["fao_manual3_ch3"], note: "" },
    salinityTolerance: { value: { thresholdEce: 1.7, slopePctPerDs: 12.0 }, validation: "verified", sources: ["maas_hoffman"], note: "Potato is moderately salt-sensitive (MS). International values, not Uzbekistan-specific yield predictions." },
    calendar: { value: [
      { zones: ["001", "004", "009"], season: "Autumn", sowFrom: [11, 10], sowTo: [11, 20], growingDays: [175, 180], practice: "Irrigated" },
      { zones: ["002"], season: "Spring", sowFrom: [2, 15], sowTo: [3, 15], growingDays: [175, 180], practice: "Irrigated" },
    ], validation: "verified", sources: ["fao_cropcalendar_uz"], note: "Reproduced as published by FAO; no potato season listed for zones 003, 005–008." },
    irrigationNote: "Highly sensitive to drought — needs regular, even watering.",
    limitations: ["Night temperatures below ~15 °C are needed for tuber initiation (FAO)."],
    localValidation: "not_validated",
  },
  {
    slug: "rice", name: "Rice", nameUz: "Sholi",
    ph: U("No reliable source sourced yet; not scored."),
    texture: U("No reliable source sourced yet; not scored."),
    temperature: U("FAO Land & Water has no rice page; no verified rule yet, so not scored."),
    waterNeedMm: { value: [450, 700], validation: "verified", sources: ["fao_manual3_ch2"], note: "Rice (paddy) crop evapotranspiration only — excludes puddling, percolation and flooding losses, which are large in practice." },
    growingPeriodDays: { value: [90, 150], validation: "verified", sources: ["fao_manual3_ch2"], note: "" },
    droughtSensitivity: { value: "high", validation: "verified", sources: ["fao_manual3_ch3"], note: "" },
    salinityTolerance: { value: { thresholdEce: 3.0, slopePctPerDs: 12.0 }, validation: "verified", sources: ["maas_hoffman"], note: "Paddy rice is salt-sensitive (S). International values, not Uzbekistan-specific yield predictions." },
    calendar: { value: [
      { zones: ["001", "004"], season: "Spring", sowFrom: [4, 30], sowTo: [5, 20], growingDays: [135, 140], practice: "Irrigated, direct sowing" },
      { zones: ["007"], season: "Spring", sowFrom: [4, 25], sowTo: [5, 10], growingDays: [145, 150], practice: "Irrigated, direct sowing" },
      { zones: ["009"], season: "Spring", sowFrom: [4, 30], sowTo: [5, 20], growingDays: [145, 150], practice: "Irrigated, direct sowing" },
    ], validation: "verified", sources: ["fao_cropcalendar_uz"], note: "No rice season listed for zones 002, 003, 005, 006, 008." },
    irrigationNote: "Paddy rice needs flooded fields; real field water use is far above the crop's own 450–700 mm need.",
    limitations: ["Very high field water use; local water allocation limits apply."],
    localValidation: "not_validated",
  },
  {
    slug: "tomato", name: "Tomato", nameUz: "Pomidor",
    ph: { value: [5, 7], validation: "verified", sources: ["fao_tomato"], note: "FAO: well-drained, light loam soil with pH 5 to 7 preferred." },
    texture: { value: ["coarse", "medium"], validation: "interpretation", sources: ["fao_tomato"], note: "FAO 'light loam', 'well-drained' mapped by AgroAI to coarse/medium USDA texture classes; waterlogging increases disease." },
    temperature: {
      value: { optimum: [18, 25], lowerLimit: 10, upperLimit: null },
      validation: "interpretation", sources: ["fao_tomato"],
      note: "FAO: optimum mean daily 18–25 °C, nights 10–20 °C, very frost sensitive. Lower limit 10 °C taken from the night range by AgroAI; no sourced upper limit (above 25 °C scores half).",
    },
    waterNeedMm: { value: [400, 800], validation: "verified", sources: ["fao_manual3_ch2"], note: "" },
    growingPeriodDays: { value: [90, 150], validation: "verified", sources: ["fao_tomato"], note: "FAO tomato page: 90–150 days (Table 4: 135–180 incl. nursery)." },
    droughtSensitivity: { value: "medium-high", validation: "verified", sources: ["fao_manual3_ch3"], note: "" },
    salinityTolerance: { value: { thresholdEce: 2.5, slopePctPerDs: 9.9 }, validation: "verified", sources: ["maas_hoffman"], note: "Tomato is moderately salt-sensitive (MS). International values, not Uzbekistan-specific yield predictions." },
    calendar: { value: [
      { zones: ["001", "004", "009"], season: "Spring (seedlings under cover)", sowFrom: [2, 10], sowTo: [2, 20], growingDays: [90, 95], practice: "Irrigated" },
      { zones: ["001", "004", "009"], season: "Spring", sowFrom: [3, 10], sowTo: [3, 20], growingDays: [90, 95], practice: "Irrigated" },
      { zones: ["002"], season: "Spring", sowFrom: [4, 10], sowTo: [5, 10], growingDays: [95, 100], practice: "Irrigated" },
    ], validation: "verified", sources: ["fao_cropcalendar_uz"], note: "No tomato season listed for zones 003, 005–008." },
    irrigationNote: "Dry climates suit tomato, but it needs regular irrigation.",
    limitations: ["Very sensitive to frost (FAO).", "High humidity increases disease (FAO)."],
    localValidation: "not_validated",
  },
  {
    slug: "maize", name: "Maize", nameUz: "Makkajo'xori",
    ph: U("No pH range found in the FAO source used; not scored."),
    texture: U("Soil texture preference not stated in the FAO source used; not scored."),
    temperature: {
      value: { optimum: [20, null], lowerLimit: 10, upperLimit: null },
      validation: "interpretation", sources: ["fao_maize"],
      note: "FAO: grown when mean daily >15 °C and frost-free; >20 °C gives normal maturity; 10–15 °C mostly forage only. AgroAI scores 10 °C as 0, ≥20 °C as optimal.",
    },
    waterNeedMm: { value: [500, 800], validation: "verified", sources: ["fao_manual3_ch2"], note: "" },
    growingPeriodDays: { value: [125, 180], validation: "verified", sources: ["fao_manual3_ch2"], note: "Maize grain." },
    droughtSensitivity: { value: "medium-high", validation: "verified", sources: ["fao_manual3_ch3"], note: "" },
    salinityTolerance: { value: { thresholdEce: 1.7, slopePctPerDs: 12.0 }, validation: "verified", sources: ["maas_hoffman"], note: "Maize (corn) is moderately salt-sensitive (MS). International values, not Uzbekistan-specific yield predictions." },
    calendar: U("FAO Crop Calendar for Uzbekistan lists only sweet corn, not grain maize; planting month not checked."),
    irrigationNote: "Sensitive to water shortage around flowering.",
    limitations: ["Very sensitive to frost at the seedling stage (FAO)."],
    localValidation: "not_validated",
  },
];
