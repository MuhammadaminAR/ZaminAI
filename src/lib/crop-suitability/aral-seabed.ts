/**
 * Exposed Aral Sea seabed — high soil-salinity risk screening zone.
 *
 * Provenance: Natural Earth 10m lakes (public domain).
 *  - HISTORIC_RING: "Aral Sea" polygon from Natural Earth v4.1.0 (late-20th-century extent).
 *  - CURRENT_WATER: "North Aral Sea" / "South Aral Sea" polygons from Natural Earth v5.x (current water).
 * A point is treated as exposed seabed when it lies inside the historic extent but outside
 * today's water polygons.
 *
 * KNOWN LIMITATIONS (stated honestly, per project rules):
 *  - The v4.1.0 outline already reflects partial shrinkage, so the zone UNDER-covers the full
 *    1960 seabed (the former eastern lobe is not fully included). It never over-covers.
 *  - This is a screening flag only: it triggers "salinity not verified" warnings and suppresses
 *    numeric scores until a lab salinity test is provided. It never declares land unusable.
 *  - No validated national salinity boundary (Uzbekistan Ministry of Agriculture GIS / FAO
 *    GSASmap point lookup) is currently integrable; none of these offer a public point-query API.
 *
 * Browser-safe (no server imports).
 */

export const SEABED_ZONE_VERSION = "aral-seabed-zone-v1-ne";
export const SEABED_ZONE_SOURCE =
  "Natural Earth 10m lakes: historic outline v4.1.0 minus current water polygons v5.x (public domain). Conservative screening zone — under-covers the full 1960 seabed.";

/** [lng, lat] rings, simplified (Douglas-Peucker, ~0.08° tolerance). */
const HISTORIC_RING: [number, number][] = [
  [61.289, 46.398], [61.201, 46.231], [60.804, 46.128], [60.434, 45.844], [59.82, 45.896],
  [59.733, 45.597], [60.02, 45.573], [60.085, 45.365], [60.045, 44.43], [59.913, 44.225],
  [59.541, 44.148], [59.649, 44.35], [59.206, 44.689], [59.459, 45.258], [59.394, 45.571],
  [59.114, 45.814], [58.704, 45.395], [58.809, 45.189], [58.64, 44.997], [58.819, 45.042],
  [58.784, 44.752], [58.635, 44.771], [58.697, 44.67], [58.441, 44.446], [58.259, 44.46],
  [58.241, 44.929], [58.741, 45.88], [59.305, 46.014], [59.229, 45.748], [59.623, 45.773],
  [59.731, 46.076], [59.535, 46.35], [59.794, 46.291], [59.795, 46.065], [60.702, 46.082],
  [60.825, 46.199], [60.737, 46.4], [60.571, 46.315], [59.992, 46.473], [60.247, 46.706],
  [60.415, 46.497], [60.475, 46.625], [60.773, 46.654], [60.563, 46.79], [60.804, 46.757],
  [60.87, 46.502], [61.288, 46.418], [61.289, 46.398],
];

const CURRENT_WATER: [number, number][][] = [
  // South Aral Sea (current water)
  [
    [58.312, 45.062], [58.712, 45.835], [59.303, 46.002], [58.914, 45.795], [58.869, 45.596],
    [58.672, 45.46], [58.682, 45.13], [58.547, 45.008], [58.624, 44.818], [58.364, 44.425],
    [58.235, 44.461], [58.312, 45.059], [58.312, 45.062],
  ],
  // North Aral Sea (current water)
  [
    [60.783, 46.086], [60.722, 46.374], [60.133, 46.357], [59.988, 46.438], [60.002, 46.572],
    [60.287, 46.7], [60.411, 46.483], [60.459, 46.628], [60.766, 46.643], [60.58, 46.784],
    [60.811, 46.747], [60.776, 46.581], [60.892, 46.473], [61.134, 46.45], [61.315, 46.648],
    [61.528, 46.677], [61.28, 46.48], [61.217, 46.237], [60.862, 46.09], [60.783, 46.086],
  ],
];

function insideRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[i + 1]!;
    if (y1 > lat !== y2 > lat && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

/** True when the point lies on the exposed former seabed (historic extent minus current water). */
export function isExposedAralSeabed(latitude: number, longitude: number): boolean {
  if (!insideRing(longitude, latitude, HISTORIC_RING)) return false;
  return !CURRENT_WATER.some((ring) => insideRing(longitude, latitude, ring));
}
