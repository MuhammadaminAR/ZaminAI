/** Soil-only profile extensions. Never rewrite historical mixed-factor profiles. */
import { CROP_PROFILES, type CropSuitabilityProfile } from "./profiles";
export const SOIL_PROFILE_VERSION = "crop-soil-profiles-v2-fao-ecocrop-2026-10";

type SoilOverride = Partial<Pick<CropSuitabilityProfile, "ph" | "texture">>;

/** FAO EcoCrop soil rules verified against the published data sheets (October 2026). */
const SOIL_OVERRIDES: Record<string, SoilOverride> = {
  cotton: {
    ph: { value: [6, 7.5], validation: "verified", sources: ["fao_ecocrop_cotton"], note: "FAO EcoCrop Gossypium hirsutum: optimal pH 6–7.5, absolute 5–9.5. Database screening bands, not local field validation." },
    texture: { value: ["fine", "medium"], validation: "interpretation", sources: ["fao_ecocrop_cotton"], note: "FAO EcoCrop optimal texture 'heavy, medium' mapped by AgroAI to fine/medium USDA texture groups." },
  },
  wheat: {
    ph: { value: [6, 7], validation: "verified", sources: ["fao_ecocrop_wheat"], note: "FAO EcoCrop Triticum aestivum: optimal pH 6–7, absolute 5.5–8.5. Database screening bands, not local field validation." },
    texture: { value: ["medium"], validation: "interpretation", sources: ["fao_ecocrop_wheat"], note: "FAO EcoCrop optimal texture 'medium, organic' mapped by AgroAI to the medium USDA texture group; 'organic' has no USDA texture equivalent." },
  },
  maize: {
    ph: { value: [5, 7], validation: "verified", sources: ["fao_ecocrop_maize"], note: "FAO EcoCrop Zea mays: optimal pH 5–7, absolute 4.5–8.5. Database screening bands, not local field validation." },
    texture: { value: null, validation: "unverified", sources: ["fao_ecocrop_maize"], note: "FAO EcoCrop lists no soil texture entry for Zea mays; no crop-specific discriminating texture rule." },
  },
  rice: {
    ph: { value: [5.5, 7], validation: "verified", sources: ["fao_ecocrop_rice"], note: "FAO EcoCrop Oryza sativa: optimal pH 5.5–7, absolute 4.5–9. Database screening bands, not local field validation." },
    texture: { value: null, validation: "unverified", sources: ["fao_ecocrop_rice"], note: "FAO EcoCrop lists wide texture adaptability for Oryza sativa; this gives no crop-specific discriminating texture rule. Do not transfer heavy-texture requirements from a different subspecies." },
  },
};

export const SOIL_CROP_PROFILES = CROP_PROFILES.map((p) => {
  const o = SOIL_OVERRIDES[p.slug];
  return o ? { ...p, ...o } : p;
});
