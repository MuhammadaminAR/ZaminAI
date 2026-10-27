CREATE TABLE public.historical_climate_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  analysis_request_id uuid NOT NULL REFERENCES public.analysis_requests(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('success','partial')),
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_request_id, start_date, end_date)
);
GRANT SELECT, INSERT ON public.historical_climate_summaries TO authenticated;
GRANT ALL ON public.historical_climate_summaries TO service_role;
ALTER TABLE public.historical_climate_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read climate" ON public.historical_climate_summaries FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owners insert climate" ON public.historical_climate_summaries FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.analysis_requests a WHERE a.id = analysis_request_id AND a.user_id = auth.uid()));