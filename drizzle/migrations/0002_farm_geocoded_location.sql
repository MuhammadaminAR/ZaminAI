ALTER TABLE public.farms
  ADD COLUMN country text,
  ADD COLUMN country_code text,
  ADD COLUMN region text,
  ADD COLUMN district text,
  ADD COLUMN locality text,
  ADD COLUMN formatted_address text,
  ADD COLUMN location_source text NOT NULL DEFAULT 'unresolved',
  ADD COLUMN location_status text NOT NULL DEFAULT 'needs_review';
COMMENT ON COLUMN public.farms.location_name IS 'DEPRECATED: demo-generated label; use region/district/locality from reverse geocoding';