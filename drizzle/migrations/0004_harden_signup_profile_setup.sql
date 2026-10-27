-- Single source of truth for account setup: provision_user(), called by the auth trigger
-- and (for recovery of accounts whose setup failed) by the signed-in user via ensure_my_profile().
CREATE OR REPLACE FUNCTION public.provision_user(_id uuid, _email text, _full_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (_id, COALESCE(NULLIF(trim(_full_name), ''), split_part(COALESCE(_email,''), '@', 1), ''), COALESCE(_email, ''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (_id, 'farmer')
  ON CONFLICT (user_id, role) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = _id) THEN
    INSERT INTO public.subscriptions (user_id, plan, status) VALUES (_id, 'free', 'active');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.provision_user(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.provision_user(NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  EXCEPTION WHEN OTHERS THEN
    -- Never block the auth signup; the app completes setup via ensure_my_profile().
    RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u auth.users%ROWTYPE;
BEGIN
  SELECT * INTO u FROM auth.users WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Not signed in'; END IF;
  PERFORM public.provision_user(u.id, u.email, u.raw_user_meta_data->>'full_name');
END $$;
REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;