import { describe, expect, it } from "vitest";
import { calculateEconomics, emptyEconomicsInputs, exampleEconomicsInputs } from "./farm-economics";

describe("farm economics", () => {
  const example = exampleEconomicsInputs();
  it("produces 6 tonnes from 2 hectares at 3 tonnes per hectare", () => {
    expect(calculateEconomics(example).result?.production).toBe(6);
  });
  it("produces 24 million UZS revenue", () => {
    expect(calculateEconomics(example).result?.revenue).toBe(24_000_000);
  });
  it("sums all whole-farm costs", () => {
    expect(calculateEconomics({ ...example, seed: "10000000", fertilizer: "1000000", irrigation: "1000000", labor: "1000000", machinery: "1000000", additional: "1000000" }).result?.costs).toBe(15_000_000);
  });
  it("produces 9 million UZS net profit", () => {
    expect(calculateEconomics(example).result?.profit).toBe(9_000_000);
  });
  it("produces 4.5 million UZS profit per hectare", () => {
    expect(calculateEconomics(example).result?.profitPerHa).toBe(4_500_000);
  });
  it("calculates per-hectare revenue and costs", () => {
    expect(calculateEconomics(example).result).toMatchObject({ revenuePerHa: 12_000_000, costsPerHa: 7_500_000 });
  });
  it("produces 37.5 percent profit margin", () => {
    expect(calculateEconomics(example).result?.margin).toBe(37.5);
  });
  it("produces 2.5 million UZS per tonne break-even price", () => {
    expect(calculateEconomics(example).result?.breakEven).toBe(2_500_000);
  });
  it("rejects zero area without division", () => {
    expect(calculateEconomics({ ...example, area: "0" })).toMatchObject({ errors: { area: "areaPositive" }, result: null });
  });
  it("keeps break-even and margin unavailable for zero production", () => {
    expect(calculateEconomics({ ...example, yield: "0" }).result).toMatchObject({ production: 0, revenue: 0, profit: -15_000_000, margin: null, breakEven: null });
  });
  it("keeps margin unavailable when price is zero", () => {
    expect(calculateEconomics({ ...example, price: "0" }).result).toMatchObject({ revenue: 0, margin: null, breakEven: 2_500_000 });
  });
  it("preserves negative profit and margin", () => {
    expect(calculateEconomics({ ...example, price: "2000000" }).result).toMatchObject({ profit: -3_000_000, profitPerHa: -1_500_000, margin: -25 });
  });
  it("rejects missing inputs", () => {
    expect(calculateEconomics(emptyEconomicsInputs()).result).toBeNull();
    expect(calculateEconomics(emptyEconomicsInputs()).errors.seed).toBe("required");
  });
  it.each(["-1", "NaN", "Infinity", "invalid"])("rejects invalid or negative values %s", value => {
    expect(calculateEconomics({ ...example, labor: value })).toMatchObject({ errors: { labor: "nonnegative" }, result: null });
  });
  it("rejects overflow", () => {
    expect(calculateEconomics({ ...example, area: "1e308", yield: "1e308" }).result).toBeNull();
  });
});