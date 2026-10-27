-- Shared server-side cache of successful Open-Meteo archive responses, one row per dataset (model)
-- and exact requested coordinates. Written only by server code (service role); never by clients.
CREATE TABLE public.historical_weather_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model text NOT NULL CHECK (model IN ('era5_land','era5')),
  data_version text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  returned_latitude double precision,
  returned_longitude double precision,
  status text NOT NULL CHECK (status IN ('success','partial')),
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model, data_version, latitude, longitude, start_date, end_date)
);
GRANT ALL ON public.historical_weather_cache TO service_role;
ALTER TABLE public.historical_weather_cache ENABLE ROW LEVEL SECURITY;

-- Provider rate-limit cooldowns (HTTP 429), shared by all server instances.
CREATE TABLE public.provider_cooldowns (
  provider text PRIMARY KEY,
  cooldown_until timestamptz NOT NULL,
  consecutive_429 integer NOT NULL DEFAULT 1,
  last_status integer NOT NULL,
  last_reason text,
  endpoint text,
  dataset text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.provider_cooldowns TO service_role;
ALTER TABLE public.provider_cooldowns ENABLE ROW LEVEL SECURITY;