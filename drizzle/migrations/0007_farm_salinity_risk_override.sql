ALTER TABLE public.farms ADD COLUMN salinity_risk_override text;

COMMENT ON COLUMN public.farms.salinity_risk_override IS 'Manual high-salinity-risk flag for locations a screening polygon cannot cover (e.g. exposed Aral seabed outside the Natural Earth historic outline). high = suppress numeric crop scores until lab ECe; standard = explicitly reviewed, normal rules; NULL = automatic (zone polygon). Owners may only ever set high (conservative); standard requires admin.';

CREATE POLICY "Farms admin update"
ON public.farms
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));