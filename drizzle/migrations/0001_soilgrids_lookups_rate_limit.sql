CREATE TABLE public.soilgrids_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX soilgrids_lookups_user_time ON public.soilgrids_lookups (user_id, created_at DESC);
GRANT SELECT, INSERT ON public.soilgrids_lookups TO authenticated;
GRANT ALL ON public.soilgrids_lookups TO service_role;
ALTER TABLE public.soilgrids_lookups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own lookups" ON public.soilgrids_lookups FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users log own lookups" ON public.soilgrids_lookups FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);