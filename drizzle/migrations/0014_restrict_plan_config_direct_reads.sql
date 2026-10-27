DROP POLICY IF EXISTS "Plan configs readable by signed-in users" ON public.plan_configs;
REVOKE SELECT ON TABLE public.plan_configs FROM anon, authenticated;
COMMENT ON TABLE public.plan_configs IS 'Quota configuration is internal. Authenticated users receive their own allowance through the existing security-definer quota functions, not direct table reads.';