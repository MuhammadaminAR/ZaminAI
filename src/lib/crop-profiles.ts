import type { CropProfile } from "./types";

/**
 * Demo configuration only. These ranges are placeholders used to drive the
 * mock scoring engine and must be validated against agricultural data
 * before being treated as agronomic guidance.
 */
export const cropProfiles: CropProfile[] = [
  {
    id: "cotton",
    name: "Cotton",
    emoji: "🌱",
    phRange: [6.0, 8.0],
    rainfallRangeMm: [500, 900],
    tempRangeC: [18, 30],
    preferredClayPct: [15, 35],
    note: "Widely grown across irrigated lowland regions.",
  },
  {
    id: "wheat",
    name: "Wheat",
    emoji: "🌾",
    phRange: [6.0, 7.5],
    rainfallRangeMm: [350, 700],
    tempRangeC: [10, 24],
    preferredClayPct: [20, 40],
    note: "Tolerates cooler seasons and moderate rainfall.",
  },
  {
    id: "potato",
    name: "Potato",
    emoji: "🥔",
    phRange: [5.0, 6.8],
    rainfallRangeMm: [450, 800],
    tempRangeC: [12, 22],
    preferredClayPct: [10, 25],
    note: "Prefers loose, well-drained soils.",
  },
  {
    id: "rice",
    name: "Rice",
    emoji: "🍚",
    phRange: [5.5, 7.0],
    rainfallRangeMm: [900, 1800],
    tempRangeC: [20, 32],
    preferredClayPct: [30, 60],
    note: "Needs abundant and reliable water supply.",
  },
  {
    id: "tomato",
    name: "Tomato",
    emoji: "🍅",
    phRange: [6.0, 7.0],
    rainfallRangeMm: [400, 800],
    tempRangeC: [16, 28],
    preferredClayPct: [10, 30],
    note: "Sensitive to waterlogging and late frost.",
  },
  {
    id: "maize",
    name: "Maize",
    emoji: "🌽",
    phRange: [5.8, 7.2],
    rainfallRangeMm: [500, 1000],
    tempRangeC: [16, 30],
    preferredClayPct: [15, 35],
    note: "Responds strongly to nitrogen availability.",
  },
];
