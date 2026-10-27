ALTER TABLE public.weather_analyses
  ADD COLUMN latitude double precision,
  ADD COLUMN longitude double precision,
  ADD COLUMN timezone text,
  ADD COLUMN current_temperature_c numeric,
  ADD COLUMN current_relative_humidity_percent numeric,
  ADD COLUMN current_precipitation_mm numeric,
  ADD COLUMN current_rain_mm numeric,
  ADD COLUMN current_wind_speed_kmh numeric,
  ADD COLUMN current_weather_code integer,
  ADD COLUMN forecast jsonb,
  ADD COLUMN fetched_at timestamptz;

-- Per-service outcome for new analyses (NULL = created before real integrations).
ALTER TABLE public.analysis_requests
  ADD COLUMN soil_status text CHECK (soil_status IN ('success','no_data','error','demo')),
  ADD COLUMN weather_status text CHECK (weather_status IN ('success','error'));