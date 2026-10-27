CREATE TABLE public.crop_suitability_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  analysis_request_id uuid NOT NULL REFERENCES public.analysis_requests(id) ON DELETE CASCADE,
  soil_analysis_id uuid REFERENCES public.soil_analyses(id) ON DELETE SET NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  irrigation text NOT NULL CHECK (irrigation IN ('reliable','limited','rainfed','unknown')),
  planting_month integer CHECK (planting_month BETWEEN 1 AND 12),
  profile_version text NOT NULL,
  rules_version text NOT NULL,
  weights jsonb NOT NULL,
  crops jsonb NOT NULL,
  climate_summary jsonb,
  climate_status text NOT NULL,
  preliminary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crop_suitability_assessments_analysis_idx ON public.crop_suitability_assessments (analysis_request_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.crop_suitability_assessments TO authenticated;
GRANT ALL ON public.crop_suitability_assessments TO service_role;
ALTER TABLE public.crop_suitability_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Assessments read" ON public.crop_suitability_assessments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Assessments insert" ON public.crop_suitability_assessments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.owns_farm(farm_id));
CREATE POLICY "Assessments delete" ON public.crop_suitability_assessments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);