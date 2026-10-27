export const ECONOMICS_CROPS = ["cotton", "wheat", "potato", "tomato", "maize", "rice"] as const;
export type EconomicsCrop = (typeof ECONOMICS_CROPS)[number];
export const COST_FIELDS = ["seed", "fertilizer", "irrigation", "labor", "machinery", "additional"] as const;
export const ECONOMICS_FIELDS = ["area", "yield", "price", ...COST_FIELDS] as const;
export type EconomicsField = (typeof ECONOMICS_FIELDS)[number];
export type EconomicsInputs = Record<EconomicsField, string>;
export type EconomicsIssue = "required" | "nonnegative" | "areaPositive" | "tooLarge";
export function emptyEconomicsInputs(): EconomicsInputs {
  return { area: "", yield: "", price: "", seed: "", fertilizer: "", irrigation: "", labor: "", machinery: "", additional: "" };
}
/** Explicitly loaded editable arithmetic example, never market data. */
export function exampleEconomicsInputs(): EconomicsInputs {
  return { area: "2", yield: "3", price: "4000000", seed: "15000000", fertilizer: "0", irrigation: "0", labor: "0", machinery: "0", additional: "0" };
}
export function calculateEconomics(input: EconomicsInputs) {
  const errors: Partial<Record<EconomicsField, EconomicsIssue>> = {};
  const values = {} as Record<EconomicsField, number>;
  for (const field of ECONOMICS_FIELDS) {
    const text = input[field].trim();
    const value = Number(text);
    if (!text) errors[field] = "required";
    else if (!Number.isFinite(value) || value < 0) errors[field] = "nonnegative";
    else if (field === "area" && value === 0) errors[field] = "areaPositive";
    values[field] = value;
  }
  if (Object.keys(errors).length) return { errors, result: null };
  const production = values.area * values.yield;
  const revenue = production * values.price;
  const costs = COST_FIELDS.reduce((sum, field) => sum + values[field], 0);
  const profit = revenue - costs;
  const result = {
    production, revenue, costs, profit,
    revenuePerHa: revenue / values.area,
    costsPerHa: costs / values.area,
    profitPerHa: profit / values.area,
    margin: revenue > 0 ? (profit / revenue) * 100 : null,
    breakEven: production > 0 ? costs / production : null,
  };
  if (Object.values(result).some(value => value !== null && !Number.isFinite(value))) {
    return { errors: { area: "tooLarge" } as Partial<Record<EconomicsField, EconomicsIssue>>, result: null };
  }
  return { errors, result };
}