CREATE TABLE public.prepared_climate_cells (
 dataset text NOT NULL CHECK (dataset IN ('chirps_v3','era5_land_cds')),
 grid_version text NOT NULL,
 cell_id text NOT NULL,
 start_date date NOT NULL CHECK (start_date = DATE '2016-01-01'),
 end_date date NOT NULL CHECK (end_date = DATE '2025-12-31'),
 west double precision NOT NULL, east double precision NOT NULL,
 south double precision NOT NULL, north double precision NOT NULL,
 center_latitude double precision NOT NULL, center_longitude double precision NOT NULL,
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
 imported_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (dataset, grid_version, cell_id, start_date, end_date),
 CHECK (west < east AND south < north),
 CHECK (center_longitude >= west AND center_longitude < east AND center_latitude >= south AND center_latitude < north)
);
GRANT SELECT ON public.prepared_climate_cells TO authenticated;
GRANT ALL ON public.prepared_climate_cells TO service_role;
ALTER TABLE public.prepared_climate_cells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in users read prepared climate" ON public.prepared_climate_cells FOR SELECT TO authenticated USING (true);
CREATE INDEX prepared_climate_cells_lookup ON public.prepared_climate_cells (dataset, start_date, end_date, west, south);
COMMENT ON TABLE public.prepared_climate_cells IS 'Official precomputed climate summaries. Only privileged offline imports write. Half-open actual source cell bounds; multiple matches fail closed. No fabricated seed rows.';