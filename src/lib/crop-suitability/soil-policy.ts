/** Configurable AgroAI product limits, NOT scientific crop thresholds. */
export const SOIL_POLICY = {
  phWeight: 60,
  textureWeight: 40,
  /** pH distance outside the preferred range over which the pH factor declines linearly from 1 to 0. */
  phDeclineSpan: 2,
  textureMismatchScore: 0.3,
  highSalinityWithoutLabCap: 40,
  zeroSalinityToleranceCap: 35,
} as const;

/** Approximate product interpretation bands for the 0–100 soil-match score (not scientific thresholds). */
export const SOIL_SCORE_BANDS = { strong: 80, reasonable: 60, mixed: 40 } as const;

export const SOIL_RULES_VERSION = "suitability-rules-v7-soil-renormalized";
