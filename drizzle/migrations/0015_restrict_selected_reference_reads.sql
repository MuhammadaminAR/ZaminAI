DROP POLICY IF EXISTS "Signed in users read prepared climate" ON public.prepared_climate_cells;
CREATE POLICY "Administrators read prepared climate" ON public.prepared_climate_cells FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
REVOKE SELECT ON TABLE public.prepared_climate_cells FROM anon;
GRANT SELECT ON TABLE public.prepared_climate_cells TO authenticated;
DROP POLICY IF EXISTS "Crop profiles public read" ON public.crop_profiles;
CREATE POLICY "Signed in users read crop profiles" ON public.crop_profiles FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON TABLE public.crop_profiles FROM anon;
GRANT SELECT ON TABLE public.crop_profiles TO authenticated;