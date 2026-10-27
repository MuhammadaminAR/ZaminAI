CREATE TABLE public.ai_agronomy_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  assessment_id uuid NOT NULL REFERENCES public.crop_suitability_assessments(id) ON DELETE CASCADE,
  analysis_request_id uuid NOT NULL,
  source_version text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  language text NOT NULL DEFAULT 'uz-Latn',
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_agronomy_explanations_analysis_idx ON public.ai_agronomy_explanations(analysis_request_id, created_at DESC);
GRANT SELECT, INSERT ON public.ai_agronomy_explanations TO authenticated;
GRANT ALL ON public.ai_agronomy_explanations TO service_role;
ALTER TABLE public.ai_agronomy_explanations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own explanations select" ON public.ai_agronomy_explanations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own explanations insert" ON public.ai_agronomy_explanations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.crop_suitability_assessments a WHERE a.id = assessment_id AND a.user_id = auth.uid()));