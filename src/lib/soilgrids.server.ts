import { fromArrayBuffer } from "geotiff";

/**
 * ISRIC SoilGrids 2.0 via the official WCS endpoint (no API key).
 * Values are model PREDICTIONS (Q0.5, 0-5cm), not lab measurements.
 */
const ENDPOINT = "https://maps.isric.org/mapserv";
const DEPTH = "0-5cm";
const QUANTILE = "Q0.5";
const HALF_BOX = 0.005; // degrees, ~500m; always covers the 250m cell
const TIMEOUT_MS = 20000;
const NODATA = -32768;

const PROPERTIES = {
  phh2o: { key: "ph", divisor: 10 },
  nitrogen: { key: "nitrogen_g_per_kg", divisor: 100 },
  clay: { key: "clay_percent", divisor: 10 },
  sand: { key: "sand_percent", divisor: 10 },
  silt: { key: "silt_percent", divisor: 10 },
  soc: { key: "organic_carbon_g_per_kg", divisor: 10 },
  cec: { key: "cec_cmol_per_kg", divisor: 10 },
} as const;

type Prop = keyof typeof PROPERTIES;
type SoilKey = (typeof PROPERTIES)[Prop]["key"];

export interface SoilGridsResult {
  success: boolean;
  source: "ISRIC SoilGrids 2.0";
  data_source: string;
  latitude: number;
  longitude: number;
  depth: typeof DEPTH;
  prediction: typeof QUANTILE;
  timestamp: string;
  soil: Record<SoilKey, number | null>;
  errors: Partial<Record<Prop, string>>;
}

function buildUrl(prop: Prop, lat: number, lng: number) {
  const p = new URLSearchParams({
    map: `/map/${prop}.map`,
    SERVICE: "WCS",
    VERSION: "2.0.1",
    REQUEST: "GetCoverage",
    COVERAGEID: `${prop}_${DEPTH}_${QUANTILE}`,
    FORMAT: "GEOTIFF_INT16",
    SUBSETTINGCRS: "http://www.opengis.net/def/crs/EPSG/0/4326",
    OUTPUTCRS: "http://www.opengis.net/def/crs/EPSG/0/4326",
  });
  p.append("SUBSET", `long(${lng - HALF_BOX},${lng + HALF_BOX})`);
  p.append("SUBSET", `lat(${lat - HALF_BOX},${lat + HALF_BOX})`);
  return `${ENDPOINT}?${p.toString()}`;
}

async function fetchRaw(prop: Prop, lat: number, lng: number): Promise<number | null> {
  const res = await fetch(buildUrl(prop, lat, lng), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("tiff")) throw new Error(`Unexpected response (${type || "unknown"})`);
  const tiff = await fromArrayBuffer(await res.arrayBuffer());
  const image = await tiff.getImage();
  const [minX = 0, , , maxY = 0] = image.getBoundingBox();
  const [resX = 1, resY = -1] = image.getResolution();
  const w = image.getWidth();
  const h = image.getHeight();
  const col = Math.min(w - 1, Math.max(0, Math.floor((lng - minX) / resX)));
  const row = Math.min(h - 1, Math.max(0, Math.floor((maxY - lat) / Math.abs(resY))));
  const rasters = (await image.readRasters({ window: [col, row, col + 1, row + 1] })) as unknown as ArrayLike<number>[];
  const v = rasters[0]?.[0];
  const nodata = image.getGDALNoData() ?? NODATA;
  // SoilGrids returns 0 for masked cells (urban areas, water, bare rock)
  if (v === undefined || v === nodata || v === NODATA || v === 0) return null;
  return v;
}

export async function getSoilGrids(lat: number, lng: number): Promise<SoilGridsResult> {
  const props = Object.keys(PROPERTIES) as Prop[];
  const settled = await Promise.allSettled(props.map((p) => fetchRaw(p, lat, lng)));
  const soil = {} as Record<SoilKey, number | null>;
  const errors: SoilGridsResult["errors"] = {};
  settled.forEach((r, i) => {
    const prop = props[i]!;
    const { key, divisor } = PROPERTIES[prop];
    if (r.status === "fulfilled") {
      soil[key] = r.value === null ? null : +(r.value / divisor).toFixed(2);
      if (r.value === null) errors[prop] = "No data (masked area such as urban land or water)";
    } else {
      soil[key] = null;
      errors[prop] = r.reason instanceof Error ? r.reason.message : String(r.reason);
    }
  });
  const okCount = Object.values(soil).filter((v) => v !== null).length;
  return {
    success: okCount > 0,
    source: "ISRIC SoilGrids 2.0",
    data_source: "SoilGrids WCS estimate (predicted, not measured)",
    latitude: lat,
    longitude: lng,
    depth: DEPTH,
    prediction: QUANTILE,
    timestamp: new Date().toISOString(),
    soil,
    errors,
  };
}
