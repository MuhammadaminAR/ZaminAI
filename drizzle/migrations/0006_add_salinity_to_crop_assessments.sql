ALTER TABLE public.crop_suitability_assessments
  ADD COLUMN ec_e_ds_per_m numeric,
  ADD COLUMN ec_source text,
  ADD COLUMN water_quality text,
  ADD COLUMN drainage text,
  ADD COLUMN reclaimed text,
  ADD COLUMN salinity_risk text not null default 'unknown';

COMMENT ON COLUMN public.crop_suitability_assessments.ec_e_ds_per_m IS 'Lab-measured soil salinity ECe (dS/m, saturation extract), user-provided. NULL = not assessed; never inferred from other soil properties.';
COMMENT ON COLUMN public.crop_suitability_assessments.salinity_risk IS 'high = inside a validated high-salinity-risk zone (exposed Aral Sea seabed screening polygon); standard = outside; unknown = legacy rows before v2.';