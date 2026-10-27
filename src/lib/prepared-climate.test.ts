import { describe, expect, it } from "vitest";
import { combineCells, selectCell, validatedSavedClimate, type ClimateCell } from "./prepared-climate";
import { aggregate, type DailySeries } from "./historical-weather.server";

const cell = (dataset: ClimateCell["dataset"], west: number, east: number): ClimateCell => ({ dataset,
  grid_version: "test-fixture-not-real-data", cell_id: `${west}`, west, east, south: 41.1, north: 41.3,
  center_latitude: 41.2, center_longitude: (west + east) / 2, payload: {}, imported_at: "2026-01-01" });
describe("prepared climate safeguards (synthetic fixtures, not real data verification)", () => {
  it("keeps separate native CHIRPS and ERA5-Land cell bounds for exact coordinates", () => {
    const p = cell("chirps_v3", 69.1, 69.15), t = cell("era5_land_cds", 69.05, 69.15);
    expect(selectCell([p, t], "chirps_v3", 41.2, 69.1)?.cell_id).toBe(p.cell_id);
    expect(selectCell([p, t], "era5_land_cds", 41.2, 69.1)?.cell_id).toBe(t.cell_id);
    expect(selectCell([p], "chirps_v3", 41.2, 69.15)).toBeNull();
  });
  it("refuses ambiguous cells or versions rather than choosing arbitrarily", () => {
    const p = cell("chirps_v3", 69.1, 69.15);
    expect(selectCell([p, { ...p, grid_version: "other" }], "chirps_v3", 41.2, 69.12)).toBeNull();
  });
  it.each([[41.2, 69.1], [39.7, 66.75], [41.38, 60.36], [42.55, 59.65]])("returns unavailable, not invented climate at %s/%s when not imported", (lat, lng) => {
    const r = combineCells([], lat, lng);
    expect(r.status).toBe("no_data");
    expect(r.annual.map((a) => a.precipitation_total_mm)).toEqual(Array(10).fill(null));
    expect(r.monthly.map((m) => m.temperature_mean_avg_c)).toEqual(Array(12).fill(null));
    expect(r.diagnostics?.provider_requests).toBe(0);
    expect(r.sources.every((s) => !s.grid_cell)).toBe(true);
  });
  it("rejects invalid imported payloads without substituting old provider data", () => {
    expect(combineCells([cell("chirps_v3", 69.1, 69.15)], 41.2, 69.12).status).toBe("no_data");
  });
  it("rejects malformed or unavailable saved summaries", () => {
    expect(validatedSavedClimate({}, 41.2, 69.1)).toBeNull();
    expect(validatedSavedClimate(combineCells([], 41.2, 69.1), 41.2, 69.1)).toBeNull();
  });
  it("combines synthetic source summaries independently and validates saved coordinates", () => {
    const time: string[] = [];
    for (let d = new Date("2016-01-01T00:00:00Z"); d <= new Date("2025-12-31T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) time.push(d.toISOString().slice(0, 10));
    const values: DailySeries["values"] = { precipitation_sum: time.map(() => 1), rain_sum: time.map(() => null),
      temperature_2m_mean: time.map(() => 20), temperature_2m_min: time.map(() => 10), temperature_2m_max: time.map(() => 30), et0_fao_evapotranspiration: time.map(() => null) };
    const summaries = aggregate({ time, values });
    const p = cell("chirps_v3", 69.1, 69.15), t = cell("era5_land_cds", 69.05, 69.15);
    const prepared = [p, t].map((c) => ({ ...c, payload: { ...summaries, source: { model: c.dataset, dataset: c.dataset,
      spatial_resolution: c.dataset === "chirps_v3" ? "0.05°" : "0.1°", variables: c.dataset === "chirps_v3" ? ["precipitation_sum"] : ["temperature_2m_mean"],
      status: "success", attribution_url: "https://example.org/test-fixture", licence: "Synthetic test only", period: { start: "2016-01-01", end: "2025-12-31" } } } }));
    const r = combineCells(prepared, 41.2, 69.12);
    expect(r.annual[0]?.precipitation_total_mm).toBe(366);
    expect(r.monthly[0]?.temperature_mean_avg_c).toBe(20);
    expect(r.monthly[0]?.rain_avg_total_mm).toBeNull();
    expect(r.sources[0]?.grid_cell?.id).not.toBe(r.sources[1]?.grid_cell?.id);
    expect(validatedSavedClimate(r, 41.2, 69.12)?.source).toBe(r.source);
    expect(validatedSavedClimate(r, 41.2, 69.13)).toBeNull();
  });
});