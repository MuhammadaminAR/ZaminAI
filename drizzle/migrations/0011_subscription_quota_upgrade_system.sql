-- Centrally configurable per-plan quota policy. NULL batch_size = unlimited.
CREATE TABLE public.plan_configs (
  plan plan_id PRIMARY KEY,
  analysis_batch_size integer,
  cooldown_hours integer,
  updated_at timestamptz not null default now()
);
GRANT SELECT ON public.plan_configs TO authenticated;
GRANT ALL ON public.plan_configs TO service_role;
ALTER TABLE public.plan_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plan configs readable by signed-in users" ON public.plan_configs
  FOR SELECT TO authenticated USING (true);

-- One batch = one allowance of N analyses followed by a cooldown.
CREATE TABLE public.quota_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan plan_id NOT NULL DEFAULT 'free'::plan_id,
  batch_size integer NOT NULL,
  finalized_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  cooldown_until timestamptz
);
CREATE INDEX quota_batches_user_idx ON public.quota_batches (user_id, started_at DESC);
GRANT SELECT ON public.quota_batches TO authenticated;
GRANT ALL ON public.quota_batches TO service_role;
ALTER TABLE public.quota_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own quota batches" ON public.quota_batches
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Atomic reservation/finalization of quota units. One unit per analysis ID.
CREATE TABLE public.quota_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  batch_id uuid REFERENCES public.quota_batches(id),
  analysis_id uuid UNIQUE,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','finalized','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  finalized_at timestamptz
);
CREATE INDEX quota_reservations_user_idx ON public.quota_reservations (user_id, status);
GRANT SELECT ON public.quota_reservations TO authenticated;
GRANT ALL ON public.quota_reservations TO service_role;
ALTER TABLE public.quota_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own quota reservations" ON public.quota_reservations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Plan upgrade requests. Writable only through security-definer functions.
CREATE TABLE public.upgrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  current_plan plan_id NOT NULL,
  requested_plan plan_id NOT NULL,
  message text,
  phone text,
  contact_email text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','contacted','approved','rejected')),
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX upgrade_requests_user_idx ON public.upgrade_requests (user_id, created_at DESC);
GRANT SELECT ON public.upgrade_requests TO authenticated;
GRANT ALL ON public.upgrade_requests TO service_role;
ALTER TABLE public.upgrade_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own upgrade requests" ON public.upgrade_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all upgrade requests" ON public.upgrade_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Append-only audit log for privileged actions. No insert/update/delete policies.
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  target_request_id uuid,
  previous_plan plan_id,
  new_plan plan_id,
  previous_role app_role,
  new_role app_role,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Authoritative current plan: expired paid plans fall back to free.
CREATE OR REPLACE FUNCTION public.current_plan(_user_id uuid)
RETURNS plan_id
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT s.plan FROM public.subscriptions s
    WHERE s.user_id = _user_id AND s.status = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > now())
    ORDER BY s.created_at DESC LIMIT 1
  ), 'free'::plan_id)
$$;

-- Release reservations whose client disappeared (abandoned > expiry).
CREATE OR REPLACE FUNCTION public.release_expired_reservations(_user_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  UPDATE public.quota_reservations SET status = 'released'
  WHERE user_id = _user_id AND status = 'reserved' AND expires_at < now()
$$;

-- Authoritative quota state for the signed-in user (server clock only).
CREATE OR REPLACE FUNCTION public.quota_status()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_plan plan_id; v_size int; v_batch public.quota_batches%ROWTYPE; v_reserved int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  PERFORM public.release_expired_reservations(auth.uid());
  v_plan := public.current_plan(auth.uid());
  SELECT analysis_batch_size INTO v_size FROM public.plan_configs WHERE plan = v_plan;
  IF v_size IS NULL THEN
    RETURN jsonb_build_object('plan', v_plan, 'unlimited', true, 'batch_size', NULL,
      'used', 0, 'remaining', NULL, 'cooldown_until', NULL, 'next_available_at', NULL);
  END IF;
  SELECT * INTO v_batch FROM public.quota_batches
    WHERE user_id = auth.uid() ORDER BY started_at DESC LIMIT 1;
  IF v_batch.id IS NULL OR (v_batch.cooldown_until IS NOT NULL AND v_batch.cooldown_until <= now()) THEN
    RETURN jsonb_build_object('plan', v_plan, 'unlimited', false, 'batch_size', v_size,
      'used', 0, 'remaining', v_size, 'cooldown_until', NULL, 'next_available_at', NULL);
  END IF;
  IF v_batch.cooldown_until IS NOT NULL THEN
    RETURN jsonb_build_object('plan', v_plan, 'unlimited', false, 'batch_size', v_batch.batch_size,
      'used', v_batch.finalized_count, 'remaining', 0,
      'cooldown_until', v_batch.cooldown_until, 'next_available_at', v_batch.cooldown_until);
  END IF;
  SELECT count(*) INTO v_reserved FROM public.quota_reservations
    WHERE batch_id = v_batch.id AND status = 'reserved';
  RETURN jsonb_build_object('plan', v_plan, 'unlimited', false, 'batch_size', v_batch.batch_size,
    'used', v_batch.finalized_count + v_reserved,
    'remaining', GREATEST(v_batch.batch_size - v_batch.finalized_count - v_reserved, 0),
    'cooldown_until', NULL, 'next_available_at', NULL);
END $$;

-- Atomically reserve one quota unit. Raises when blocked.
CREATE OR REPLACE FUNCTION public.reserve_analysis_quota()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_plan plan_id; v_size int; v_batch public.quota_batches%ROWTYPE; v_reserved int; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text));
  PERFORM public.release_expired_reservations(auth.uid());
  v_plan := public.current_plan(auth.uid());
  SELECT analysis_batch_size INTO v_size FROM public.plan_configs WHERE plan = v_plan;
  IF v_size IS NULL THEN
    INSERT INTO public.quota_reservations (user_id) VALUES (auth.uid()) RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  SELECT * INTO v_batch FROM public.quota_batches
    WHERE user_id = auth.uid() ORDER BY started_at DESC LIMIT 1;
  IF v_batch.id IS NULL OR (v_batch.cooldown_until IS NOT NULL AND v_batch.cooldown_until <= now()) THEN
    INSERT INTO public.quota_batches (user_id, plan, batch_size)
      VALUES (auth.uid(), v_plan, v_size) RETURNING * INTO v_batch;
  ELSIF v_batch.cooldown_until IS NOT NULL THEN
    RAISE EXCEPTION 'Your free analyses are used up. The next allowance becomes available at %.', v_batch.cooldown_until;
  ELSE
    SELECT count(*) INTO v_reserved FROM public.quota_reservations
      WHERE batch_id = v_batch.id AND status = 'reserved';
    IF v_batch.finalized_count + v_reserved >= v_batch.batch_size THEN
      RAISE EXCEPTION 'Your free analyses are used up. The next allowance becomes available after the cooldown.';
    END IF;
  END IF;
  INSERT INTO public.quota_reservations (user_id, batch_id)
    VALUES (auth.uid(), v_batch.id) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Finalize a reservation against one saved analysis. Idempotent per analysis ID.
CREATE OR REPLACE FUNCTION public.finalize_analysis_quota(_reservation_id uuid, _analysis_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  r public.quota_reservations%ROWTYPE; b public.quota_batches%ROWTYPE; v_cool int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text));
  SELECT * INTO r FROM public.quota_reservations
    WHERE id = _reservation_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.quota_reservations
      WHERE analysis_id = _analysis_id AND user_id = auth.uid() AND status = 'finalized') THEN
      RETURN; -- duplicate finalization of the same analysis: safe no-op
    END IF;
    RAISE EXCEPTION 'Quota reservation not found.';
  END IF;
  IF r.status = 'finalized' THEN
    IF r.analysis_id = _analysis_id THEN RETURN; END IF;
    RAISE EXCEPTION 'This reservation was already used for another analysis.';
  END IF;
  IF r.status <> 'reserved' THEN RAISE EXCEPTION 'This reservation is no longer active.'; END IF;
  UPDATE public.quota_reservations
    SET status = 'finalized', analysis_id = _analysis_id, finalized_at = now()
    WHERE id = r.id;
  IF r.batch_id IS NOT NULL THEN
    UPDATE public.quota_batches SET finalized_count = finalized_count + 1
      WHERE id = r.batch_id RETURNING * INTO b;
    IF b.finalized_count >= b.batch_size AND b.cooldown_until IS NULL THEN
      SELECT cooldown_hours INTO v_cool FROM public.plan_configs WHERE plan = b.plan;
      UPDATE public.quota_batches
        SET cooldown_until = now() + make_interval(hours => COALESCE(v_cool, 72))
        WHERE id = b.id;
    END IF;
  END IF;
END $$;

-- Release a reservation when the analysis fails before any real result is saved.
CREATE OR REPLACE FUNCTION public.release_analysis_quota(_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  UPDATE public.quota_reservations SET status = 'released'
    WHERE id = _reservation_id AND user_id = auth.uid() AND status = 'reserved';
END $$;

-- Submit a plan upgrade request for the signed-in user (never for another account).
CREATE OR REPLACE FUNCTION public.submit_upgrade_request(_plan plan_id, _message text, _phone text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _plan NOT IN ('professional'::plan_id, 'premium'::plan_id) THEN
    RAISE EXCEPTION 'Invalid requested plan.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.upgrade_requests WHERE user_id = auth.uid() AND status IN ('pending','contacted')) THEN
    RAISE EXCEPTION 'You already have an upgrade request under review.';
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.upgrade_requests (user_id, current_plan, requested_plan, message, phone, contact_email)
    VALUES (auth.uid(), public.current_plan(auth.uid()), _plan,
            NULLIF(left(trim(COALESCE(_message, '')), 1000), ''),
            NULLIF(left(trim(COALESCE(_phone, '')), 40), ''),
            COALESCE(v_email, ''))
    RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Admin: review an upgrade request. Approval applies the plan server-side.
CREATE OR REPLACE FUNCTION public.admin_review_upgrade_request(
  _request_id uuid, _action text, _note text DEFAULT NULL, _expires_at timestamptz DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE req public.upgrade_requests%ROWTYPE; v_prev plan_id;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF _action NOT IN ('contacted', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid action.';
  END IF;
  SELECT * INTO req FROM public.upgrade_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;
  IF req.status IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'This request has already been decided.';
  END IF;
  UPDATE public.upgrade_requests
    SET status = _action, admin_note = NULLIF(left(trim(COALESCE(_note, '')), 1000), ''),
        reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = req.id;
  IF _action = 'approved' THEN
    v_prev := public.current_plan(req.user_id);
    UPDATE public.subscriptions
      SET plan = req.requested_plan, status = 'active', expires_at = _expires_at
      WHERE user_id = req.user_id AND status = 'active';
    IF NOT FOUND THEN
      INSERT INTO public.subscriptions (user_id, plan, status, expires_at)
        VALUES (req.user_id, req.requested_plan, 'active', _expires_at);
    END IF;
    INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, target_request_id, previous_plan, new_plan, reason)
      VALUES (auth.uid(), 'plan_approved', req.user_id, req.id, v_prev, req.requested_plan, _note);
  ELSE
    INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, target_request_id, reason)
      VALUES (auth.uid(), 'request_' || _action, req.user_id, req.id, _note);
  END IF;
END $$;

-- Admin: manually set a user's plan (never roles).
CREATE OR REPLACE FUNCTION public.admin_set_user_plan(
  _user_id uuid, _plan plan_id, _expires_at timestamptz DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_prev plan_id;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  v_prev := public.current_plan(_user_id);
  UPDATE public.subscriptions
    SET plan = _plan, status = 'active', expires_at = _expires_at
    WHERE user_id = _user_id AND status = 'active';
  IF NOT FOUND THEN
    INSERT INTO public.subscriptions (user_id, plan, status, expires_at)
      VALUES (_user_id, _plan, 'active', _expires_at);
  END IF;
  INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, previous_plan, new_plan, reason)
    VALUES (auth.uid(), 'plan_set', _user_id, v_prev, _plan, _reason);
END $$;

-- Super Admin only: grant or revoke admin/super_admin roles, with audit.
CREATE OR REPLACE FUNCTION public.superadmin_set_role(
  _user_id uuid, _role app_role, _grant boolean, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Super Admin access required.';
  END IF;
  IF _role NOT IN ('admin'::app_role, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only admin and super_admin roles can be managed here.';
  END IF;
  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, new_role, reason)
      VALUES (auth.uid(), 'role_granted', _user_id, _role, _reason);
  ELSE
    IF _role = 'super_admin'
       AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
       AND (SELECT count(*) FROM public.user_roles WHERE role = 'super_admin') <= 1 THEN
      RAISE EXCEPTION 'The last active Super Admin cannot be demoted.';
    END IF;
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
    INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, previous_role, reason)
      VALUES (auth.uid(), 'role_revoked', _user_id, _role, _reason);
  END IF;
END $$;