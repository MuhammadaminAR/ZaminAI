CREATE TYPE public.app_role AS ENUM ('admin', 'consultant', 'farmer');
CREATE TYPE public.plan_id AS ENUM ('free', 'professional', 'premium');

-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- roles (separate table to prevent privilege escalation)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Own profile read" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Own profile update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Own profile insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Own roles read" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- farms
CREATE TABLE public.farms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  location_name text,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  area_hectares numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX farms_user_idx ON public.farms(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.farms TO authenticated;
GRANT ALL ON public.farms TO service_role;
ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Farms read" ON public.farms FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Farms insert" ON public.farms FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Farms update" ON public.farms FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Farms delete" ON public.farms FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.owns_farm(_farm_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.farms WHERE id = _farm_id AND user_id = auth.uid())
$$;

-- analysis_requests
CREATE TABLE public.analysis_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','complete','failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analysis_requests_user_idx ON public.analysis_requests(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_requests TO authenticated;
GRANT ALL ON public.analysis_requests TO service_role;
ALTER TABLE public.analysis_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Requests read" ON public.analysis_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Requests insert" ON public.analysis_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.owns_farm(farm_id));
CREATE POLICY "Requests update" ON public.analysis_requests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND public.owns_farm(farm_id));
CREATE POLICY "Requests delete" ON public.analysis_requests FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- soil_analyses
CREATE TABLE public.soil_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  analysis_request_id uuid REFERENCES public.analysis_requests(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  ph numeric, nitrogen numeric, organic_carbon numeric,
  clay numeric, sand numeric, silt numeric, cec numeric,
  source text NOT NULL DEFAULT 'demo',
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- weather_analyses
CREATE TABLE public.weather_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  analysis_request_id uuid REFERENCES public.analysis_requests(id) ON DELETE CASCADE,
  rainfall numeric, temperature numeric, humidity numeric,
  water_availability text,
  source text NOT NULL DEFAULT 'demo',
  created_at timestamptz NOT NULL DEFAULT now()
);
-- crop_profiles (public reference data)
CREATE TABLE public.crop_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  crop_name text NOT NULL,
  min_ph numeric, max_ph numeric,
  preferred_temperature_min numeric, preferred_temperature_max numeric,
  preferred_rainfall_min numeric, preferred_rainfall_max numeric,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crop_profiles TO anon, authenticated;
GRANT ALL ON public.crop_profiles TO service_role;
ALTER TABLE public.crop_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Crop profiles public read" ON public.crop_profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Crop profiles admin write" ON public.crop_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.crop_profiles TO authenticated;

-- crop_recommendations
CREATE TABLE public.crop_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  analysis_request_id uuid REFERENCES public.analysis_requests(id) ON DELETE CASCADE,
  crop_profile_id uuid NOT NULL REFERENCES public.crop_profiles(id),
  suitability_score integer NOT NULL CHECK (suitability_score BETWEEN 0 AND 100),
  suitability_level text NOT NULL,
  reasons text[] NOT NULL DEFAULT '{}',
  limitations text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['soil_analyses','weather_analyses','crop_recommendations'] LOOP
    EXECUTE format('CREATE INDEX %1$s_farm_idx ON public.%1$s(farm_id)', t);
    EXECUTE format('CREATE INDEX %1$s_req_idx ON public.%1$s(analysis_request_id)', t);
    EXECUTE format('GRANT SELECT, INSERT, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Read own" ON public.%I FOR SELECT TO authenticated USING (public.owns_farm(farm_id) OR public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE POLICY "Insert own" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.owns_farm(farm_id))', t);
    EXECUTE format('CREATE POLICY "Delete own" ON public.%I FOR DELETE TO authenticated USING (public.owns_farm(farm_id))', t);
  END LOOP;
END $$;

-- subscriptions (no payment processing; admins manage plans)
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan public.plan_id NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','cancelled','expired')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_user_idx ON public.subscriptions(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Subs read" ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Subs admin manage" ON public.subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- new user bootstrap
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), COALESCE(NEW.email,''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'farmer');
  INSERT INTO public.subscriptions (user_id, plan, status) VALUES (NEW.id, 'free', 'active');
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.crop_profiles (slug, crop_name, min_ph, max_ph, preferred_temperature_min, preferred_temperature_max, preferred_rainfall_min, preferred_rainfall_max, description) VALUES
('cotton','Cotton',6.0,8.0,18,30,500,900,'Widely grown across irrigated lowland regions.'),
('wheat','Wheat',6.0,7.5,10,24,350,700,'Tolerates cooler seasons and moderate rainfall.'),
('potato','Potato',5.0,6.8,12,22,450,800,'Prefers loose, well-drained soils.'),
('rice','Rice',5.5,7.0,20,32,900,1800,'Needs abundant and reliable water supply.'),
('tomato','Tomato',6.0,7.0,16,28,400,800,'Sensitive to waterlogging and late frost.'),
('maize','Maize',5.8,7.2,16,30,500,1000,'Responds strongly to nitrogen availability.');