/** AgroAI MVP product safeguards, NOT official agronomic thresholds. Version with the engine. */
export const FALLBACK_POLICY = {
  unknownWeightAllowance: 35,
  lowCoverageThreshold: 50,
  lowCoverageCap: 45,
  moderateCoverageThreshold: 70,
  moderateCoverageCap: 60,
  missingClimateCap: 45,
  missingCriticalFactorCap: 60,
  severeRainfedRatio: 0.25,
  severeRainfedCap: 35,
  limitedRainfedRatio: 0.5,
  limitedRainfedCap: 50,
  highSalinityWithoutLabCap: 40,
  temperatureLimitCap: 44,
  zeroSalinityToleranceCap: 35,
} as const;

export interface RiskCap { key: string; cap: number; reason: string }

/** Shrink towards a conservative policy allowance, never towards an invented measurement.
 * The allowance cannot improve a poor observed fit. Missing factor scores themselves stay null.
 */
export function uncertaintyScore(observedScore: number | null, coverage: number): number {
  if (observedScore === null) return FALLBACK_POLICY.unknownWeightAllowance;
  return observedScore * coverage / 100
    + Math.min(observedScore, FALLBACK_POLICY.unknownWeightAllowance) * (100 - coverage) / 100;
}