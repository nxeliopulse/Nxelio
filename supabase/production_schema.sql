--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.2

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: claim_billing_op(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_billing_op(p_workspace_id uuid, p_stale_after_seconds integer DEFAULT 20) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  claimed BOOLEAN := false;
BEGIN
  UPDATE subscriptions
  SET billing_op_lock_at = now()
  WHERE workspace_id = p_workspace_id
    AND (billing_op_lock_at IS NULL OR billing_op_lock_at < now() - (p_stale_after_seconds || ' seconds')::interval)
  RETURNING true INTO claimed;

  RETURN COALESCE(claimed, false);
END;
$$;


--
-- Name: consume_send_quota(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_send_quota(p_workspace_id uuid, p_channel text, p_requested integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_limit   outreach_send_limits%ROWTYPE;
  v_count   outreach_send_counts%ROWTYPE;
  v_today   DATE := CURRENT_DATE;
  v_allowed INTEGER;
  v_granted INTEGER;
BEGIN
  IF p_requested <= 0 THEN RETURN 0; END IF;

  SELECT * INTO v_limit FROM outreach_send_limits
  WHERE workspace_id = p_workspace_id AND channel = p_channel;
  IF NOT FOUND THEN
    RETURN p_requested; -- no limit configured for this channel — unthrottled
  END IF;

  SELECT * INTO v_count FROM outreach_send_counts
  WHERE workspace_id = p_workspace_id AND channel = p_channel AND send_date = v_today
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO outreach_send_counts (workspace_id, channel, send_date, quota, sent_count)
    VALUES (
      p_workspace_id, p_channel, v_today,
      v_limit.daily_min + floor(random() * (v_limit.daily_max - v_limit.daily_min + 1))::INTEGER,
      0
    )
    RETURNING * INTO v_count;
  END IF;

  v_allowed := GREATEST(0, v_count.quota - v_count.sent_count);
  v_granted := LEAST(p_requested, v_allowed);

  IF v_granted > 0 THEN
    UPDATE outreach_send_counts SET sent_count = sent_count + v_granted, updated_at = now()
    WHERE id = v_count.id;
  END IF;

  RETURN v_granted;
END;
$$;


--
-- Name: create_workspace_subscription(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_workspace_subscription() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO subscriptions (
    workspace_id, plan_id, billing_interval, status,
    trial_ends_at, current_period_start, current_period_end,
    credits_remaining, credits_total
  ) VALUES (
    NEW.id, 'basic', 'monthly', 'trialing',
    now() + INTERVAL '7 days',
    now(),
    now() + INTERVAL '7 days',
    200, 200
  ) ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO credit_ledger
    (workspace_id, operation_type, credits_delta, status, metadata)
  SELECT NEW.id, 'trial_grant', 200, 'completed', '{"note":"7-day Basic trial"}'
  WHERE NOT EXISTS (
    SELECT 1 FROM credit_ledger
    WHERE workspace_id = NEW.id AND operation_type = 'trial_grant'
  );

  RETURN NEW;
END;
$$;


--
-- Name: deduct_credits(uuid, text, integer, uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deduct_credits(p_workspace_id uuid, p_operation_type text, p_amount integer DEFAULT 1, p_lead_id uuid DEFAULT NULL::uuid, p_campaign_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_sub        subscriptions%ROWTYPE;
  v_bal        INTEGER;
  v_idem_key   TEXT;
BEGIN
  SELECT * INTO v_sub
  FROM subscriptions WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No subscription found');
  END IF;

  IF v_sub.status NOT IN ('active', 'trialing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Subscription not active',
                              'status', v_sub.status);
  END IF;

  IF v_sub.status = 'trialing'
     AND v_sub.trial_ends_at IS NOT NULL
     AND v_sub.trial_ends_at < now() THEN
    UPDATE subscriptions SET status = 'canceled', updated_at = now()
    WHERE id = v_sub.id;
    RETURN jsonb_build_object('ok', false, 'error', 'Trial expired');
  END IF;

  IF v_sub.credits_remaining < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient credits',
                              'remaining', v_sub.credits_remaining);
  END IF;

  v_bal := v_sub.credits_remaining - p_amount;

  -- 1. Deduct from subscription
  UPDATE subscriptions
  SET credits_remaining = v_bal, updated_at = now()
  WHERE id = v_sub.id;

  -- 2. Append to credit ledger
  INSERT INTO credit_ledger
    (workspace_id, subscription_id, operation_type, credits_delta,
     lead_id, campaign_id, status, metadata, period_start)
  VALUES
    (p_workspace_id, v_sub.id, p_operation_type, -p_amount,
     p_lead_id, p_campaign_id, 'completed', p_metadata,
     v_sub.current_period_start);

  -- 3. Update credit_balances cache (balance is now GENERATED — only update consumed)
  INSERT INTO credit_balances (workspace_id, period_start, allocated, consumed)
  VALUES (p_workspace_id, v_sub.current_period_start, v_sub.credits_total, p_amount)
  ON CONFLICT (workspace_id, period_start) DO UPDATE SET
    consumed   = credit_balances.consumed + p_amount,
    updated_at = now();

  -- 4. Write lead_operations row (only when a lead is involved)
  IF p_lead_id IS NOT NULL THEN
    v_idem_key := p_workspace_id::TEXT || ':' || p_operation_type || ':'
                  || p_lead_id::TEXT   || ':' || extract(epoch from now())::BIGINT::TEXT;
    INSERT INTO lead_operations
      (workspace_id, subscription_id, lead_id, campaign_id, operation_type,
       credits_charged, status, idempotency_key, metadata)
    VALUES
      (p_workspace_id, v_sub.id, p_lead_id, p_campaign_id, p_operation_type,
       p_amount, 'completed', v_idem_key, p_metadata)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'remaining', v_bal, 'deducted', p_amount);
END;
$$;


--
-- Name: deduct_leads(uuid, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deduct_leads(p_workspace_id uuid, p_amount integer DEFAULT 1, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No subscription found');
  END IF;

  IF v_sub.status NOT IN ('active','trialing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Subscription not active', 'status', v_sub.status);
  END IF;

  IF v_sub.leads_remaining < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient leads remaining', 'remaining', v_sub.leads_remaining);
  END IF;

  UPDATE subscriptions SET
    leads_remaining = leads_remaining - p_amount,
    updated_at      = now()
  WHERE id = v_sub.id;

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'lead_discovery', -p_amount, 'leads', 'completed', p_metadata);

  RETURN jsonb_build_object('ok', true, 'remaining', v_sub.leads_remaining - p_amount, 'deducted', p_amount);
END;
$$;


--
-- Name: generate_capture_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_capture_slug() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  alphabet TEXT := 'abcdefghijkmnpqrstuvwxyz23456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..10 LOOP
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  END LOOP;
  RETURN result;
END;
$$;


--
-- Name: get_current_user_role_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_user_role_id() RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  SELECT role_id FROM public.users WHERE user_id = auth.uid() LIMIT 1
$$;


--
-- Name: get_current_workspace_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_workspace_id() RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  SELECT workspace_id FROM public.users WHERE user_id = auth.uid() LIMIT 1
$$;


--
-- Name: handle_new_auth_user_with_workspace(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_auth_user_with_workspace() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  new_ws UUID;
  display_name TEXT;
  picture_url TEXT;
BEGIN
  -- Skip if profile already exists (admin-invited user)
  IF EXISTS (SELECT 1 FROM public.users WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  picture_url := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  INSERT INTO public.workspaces (name, owner_id)
  VALUES (display_name || '''s workspace', NEW.id)
  RETURNING id INTO new_ws;

  INSERT INTO public.users (user_id, full_name, email, role_id, status, workspace_id, avatar_url)
  VALUES (NEW.id, display_name, NEW.email, 1, 'ACTIVE', new_ws, picture_url);

  -- Every new signup also gets a membership row for their first workspace
  -- (multi-workspace support, migration 0081) — must be preserved here since
  -- this CREATE OR REPLACE fully overwrites the function body.
  INSERT INTO public.workspace_members (user_id, workspace_id, role_id)
  VALUES (NEW.id, new_ws, 1);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_auth_user_with_workspace failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  default_role INT;
  user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.users;
  IF user_count = 0 THEN
    default_role := 1;
  ELSE
    default_role := 3;
  END IF;

  INSERT INTO public.users (user_id, email, full_name, role_id, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    default_role,
    'ACTIVE'
  );

  INSERT INTO public.user_permissions (user_id, menu_id, can_view)
  SELECT NEW.id, menu_id, TRUE FROM public.menus;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  RETURN NEW;
END;
$$;


--
-- Name: mark_trial_converted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_trial_converted() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status = 'trialing' THEN
    UPDATE billing_trials
    SET converted = true, converted_at = now()
    WHERE workspace_id = NEW.workspace_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: redeem_promotion_finalize(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_promotion_finalize(p_workspace_id uuid, p_checkout_session_id text DEFAULT NULL::text, p_stripe_subscription_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_redemption promotion_redemptions%ROWTYPE;
  v_sub        subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_redemption FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id
    AND status = 'pending'
    AND (p_checkout_session_id IS NULL OR stripe_checkout_session_id = p_checkout_session_id)
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'applied', false);  -- normal case: no promo used
  END IF;

  UPDATE promotion_redemptions
  SET status = 'completed', completed_at = now(), stripe_subscription_id = p_stripe_subscription_id
  WHERE id = v_redemption.id;

  UPDATE promotions SET times_redeemed = times_redeemed + 1, updated_at = now()
  WHERE id = v_redemption.promotion_id;

  IF v_redemption.bonus_credits_granted > 0 OR v_redemption.bonus_leads_granted > 0 THEN
    SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;
    IF FOUND THEN
      UPDATE subscriptions SET
        credits_remaining = credits_remaining + v_redemption.bonus_credits_granted,
        credits_total     = credits_total + v_redemption.bonus_credits_granted,
        leads_remaining   = leads_remaining + v_redemption.bonus_leads_granted,
        leads_total       = leads_total + v_redemption.bonus_leads_granted,
        updated_at        = now()
      WHERE id = v_sub.id;

      IF v_redemption.bonus_credits_granted > 0 THEN
        INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
        VALUES (p_workspace_id, v_sub.id, 'promo_bonus', v_redemption.bonus_credits_granted, 'credits', 'completed',
                jsonb_build_object('promotion_id', v_redemption.promotion_id, 'redemption_id', v_redemption.id));
      END IF;
      IF v_redemption.bonus_leads_granted > 0 THEN
        INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
        VALUES (p_workspace_id, v_sub.id, 'promo_bonus', v_redemption.bonus_leads_granted, 'leads', 'completed',
                jsonb_build_object('promotion_id', v_redemption.promotion_id, 'redemption_id', v_redemption.id));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'applied', true,
    'bonus_credits', v_redemption.bonus_credits_granted, 'bonus_leads', v_redemption.bonus_leads_granted);
END;
$$;


--
-- Name: redeem_promotion_start(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_promotion_start(p_workspace_id uuid, p_code text, p_plan_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_promo         promotions%ROWTYPE;
  v_completed     INTEGER;
  v_redemption_id UUID;
BEGIN
  SELECT * INTO v_promo FROM promotions WHERE code = upper(trim(p_code)) FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid promo code');
  END IF;

  IF NOT v_promo.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is no longer active');
  END IF;

  IF v_promo.valid_from > now() OR (v_promo.valid_until IS NOT NULL AND v_promo.valid_until < now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has expired');
  END IF;

  IF v_promo.applicable_plans IS NOT NULL
     AND array_length(v_promo.applicable_plans, 1) > 0
     AND NOT (p_plan_id = ANY(v_promo.applicable_plans)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is not valid for the selected plan');
  END IF;

  IF v_promo.max_redemptions IS NOT NULL AND v_promo.times_redeemed >= v_promo.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has reached its redemption limit');
  END IF;

  SELECT count(*) INTO v_completed FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id AND promotion_id = v_promo.id AND status = 'completed';

  IF v_completed > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You have already used this code');
  END IF;

  SELECT id INTO v_redemption_id FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id AND promotion_id = v_promo.id AND status = 'pending';

  IF v_redemption_id IS NULL THEN
    INSERT INTO promotion_redemptions
      (workspace_id, promotion_id, status, bonus_credits_granted, bonus_leads_granted, stripe_coupon_id)
    VALUES (p_workspace_id, v_promo.id, 'pending', v_promo.bonus_credits, v_promo.bonus_leads, v_promo.stripe_coupon_id)
    RETURNING id INTO v_redemption_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'redemption_id', v_redemption_id,
    'promotion_id', v_promo.id,
    'stripe_coupon_id', v_promo.stripe_coupon_id,
    'stripe_promotion_code_id', v_promo.stripe_promotion_code_id,
    'bonus_credits', v_promo.bonus_credits,
    'bonus_leads', v_promo.bonus_leads,
    'description', v_promo.description
  );
END;
$$;


--
-- Name: redeem_promotion_start(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_promotion_start(p_workspace_id uuid, p_code text, p_plan_id text, p_email text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_promo         promotions%ROWTYPE;
  v_completed     INTEGER;
  v_redemption_id UUID;
BEGIN
  SELECT * INTO v_promo FROM promotions WHERE code = upper(trim(p_code)) FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid promo code');
  END IF;

  IF NOT v_promo.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is no longer active');
  END IF;

  IF v_promo.valid_from > now() OR (v_promo.valid_until IS NOT NULL AND v_promo.valid_until < now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has expired');
  END IF;

  IF v_promo.restricted_email IS NOT NULL
     AND (p_email IS NULL OR lower(trim(p_email)) <> lower(v_promo.restricted_email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is not valid for your account');
  END IF;

  IF v_promo.applicable_plans IS NOT NULL
     AND array_length(v_promo.applicable_plans, 1) > 0
     AND NOT (p_plan_id = ANY(v_promo.applicable_plans)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is not valid for the selected plan');
  END IF;

  IF v_promo.max_redemptions IS NOT NULL AND v_promo.times_redeemed >= v_promo.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has reached its redemption limit');
  END IF;

  SELECT count(*) INTO v_completed FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id AND promotion_id = v_promo.id AND status = 'completed';

  IF v_completed > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You have already used this code');
  END IF;

  SELECT id INTO v_redemption_id FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id AND promotion_id = v_promo.id AND status = 'pending';

  IF v_redemption_id IS NULL THEN
    INSERT INTO promotion_redemptions
      (workspace_id, promotion_id, status, bonus_credits_granted, bonus_leads_granted, stripe_coupon_id)
    VALUES (p_workspace_id, v_promo.id, 'pending', v_promo.bonus_credits, v_promo.bonus_leads, v_promo.stripe_coupon_id)
    RETURNING id INTO v_redemption_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'redemption_id', v_redemption_id,
    'promotion_id', v_promo.id,
    'stripe_coupon_id', v_promo.stripe_coupon_id,
    'stripe_promotion_code_id', v_promo.stripe_promotion_code_id,
    'bonus_credits', v_promo.bonus_credits,
    'bonus_leads', v_promo.bonus_leads,
    'description', v_promo.description
  );
END;
$$;


--
-- Name: release_billing_op(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_billing_op(p_workspace_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE subscriptions SET billing_op_lock_at = NULL WHERE workspace_id = p_workspace_id;
END;
$$;


--
-- Name: remaining_send_quota(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remaining_send_quota(p_workspace_id uuid, p_channel text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_limit outreach_send_limits%ROWTYPE;
  v_count outreach_send_counts%ROWTYPE;
BEGIN
  SELECT * INTO v_limit FROM outreach_send_limits
  WHERE workspace_id = p_workspace_id AND channel = p_channel;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('limited', false);
  END IF;

  SELECT * INTO v_count FROM outreach_send_counts
  WHERE workspace_id = p_workspace_id AND channel = p_channel AND send_date = CURRENT_DATE;

  RETURN jsonb_build_object(
    'limited', true,
    'daily_min', v_limit.daily_min,
    'daily_max', v_limit.daily_max,
    'quota', v_count.quota,
    'sent_today', COALESCE(v_count.sent_count, 0)
  );
END;
$$;


--
-- Name: reset_monthly_credits(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_monthly_credits(p_workspace_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_sub  subscriptions%ROWTYPE;
  v_plan subscription_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND OR v_sub.status NOT IN ('active','trialing') THEN
    RETURN;
  END IF;

  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_sub.plan_id;

  UPDATE subscriptions SET
    credits_remaining       = v_plan.credits_per_cycle,
    credits_total           = v_plan.credits_per_cycle,
    low_balance_notified_at = NULL,
    -- advance from the prior anchor, not now(), so the reset day never drifts
    credits_next_reset_at   = COALESCE(credits_next_reset_at, now()) + INTERVAL '1 month',
    updated_at              = now()
  WHERE workspace_id = p_workspace_id;

  INSERT INTO credit_ledger
    (workspace_id, subscription_id, operation_type, credits_delta, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.credits_per_cycle,
          'completed', jsonb_build_object('plan', v_plan.id, 'source', 'monthly_cron'));
END;
$$;


--
-- Name: reset_subscription_cycle(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_subscription_cycle(p_workspace_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_sub  subscriptions%ROWTYPE;
  v_plan subscription_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_sub  FROM subscriptions      WHERE workspace_id = p_workspace_id FOR UPDATE;
  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_sub.plan_id;

  UPDATE subscriptions SET
    credits_remaining       = v_plan.credits_per_cycle,
    credits_total           = v_plan.credits_per_cycle,
    leads_remaining         = v_plan.leads_per_cycle,
    leads_total             = v_plan.leads_per_cycle,
    current_period_start    = now(),
    current_period_end      = CASE
                                WHEN v_sub.billing_interval = 'annual'
                                THEN now() + INTERVAL '1 year'
                                ELSE now() + INTERVAL '30 days'
                              END,
    low_balance_notified_at = NULL,
    status                  = 'active',
    updated_at              = now()
  WHERE workspace_id = p_workspace_id;

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.credits_per_cycle, 'credits',
          'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval));

  IF v_plan.leads_per_cycle > 0 THEN
    INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
    VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.leads_per_cycle, 'leads',
            'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval));
  END IF;
END;
$$;


--
-- Name: seed_default_analytics_for_workspace(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_default_analytics_for_workspace(p_workspace_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  f_sales_d UUID; f_pipeline_d UUID; f_marketing_d UUID; f_activity_d UUID; f_lead_d UUID;
  f_sales_r UUID; f_pipeline_r UUID; f_marketing_r UUID; f_activity_r UUID; f_lead_r UUID;
  dash_overview UUID; dash_pipeline UUID; dash_revenue UUID; dash_campaigns UUID; dash_activity UUID; dash_accounts UUID;
  rid UUID;
BEGIN
  -- Skip entirely if this workspace already has any dashboard (idempotent re-run guard).
  IF EXISTS (SELECT 1 FROM analytics_dashboards WHERE workspace_id = p_workspace_id) THEN
    RETURN;
  END IF;

  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'dashboard', 'Sales Reports', 1) RETURNING id INTO f_sales_d;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'dashboard', 'Pipeline Reports', 2) RETURNING id INTO f_pipeline_d;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'dashboard', 'Marketing Reports', 3) RETURNING id INTO f_marketing_d;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'dashboard', 'Activity Reports', 4) RETURNING id INTO f_activity_d;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'dashboard', 'Lead Reports', 5) RETURNING id INTO f_lead_d;

  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'report', 'Sales Reports', 1) RETURNING id INTO f_sales_r;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'report', 'Pipeline Reports', 2) RETURNING id INTO f_pipeline_r;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'report', 'Marketing Reports', 3) RETURNING id INTO f_marketing_r;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'report', 'Activity Reports', 4) RETURNING id INTO f_activity_r;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'report', 'Lead Reports', 5) RETURNING id INTO f_lead_r;

  -- ── Overview → Sales Reports ────────────────────────────────────────────
  INSERT INTO analytics_dashboards (workspace_id, folder_id, name, icon, is_system, sort_order)
    VALUES (p_workspace_id, f_sales_d, 'Overview', 'trending-up', true, 1) RETURNING id INTO dash_overview;

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Overall Sales & Engagement', 'opportunities', 'area', 'ov-combo', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_overview, rid, 12, 4, 1);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, metric, group_by, chart_type, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Revenue Split', 'opportunities', '{"type":"sum","column":"deal_value"}'::jsonb, 'stage', 'donut', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_overview, rid, 6, 4, 2);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Recent Prospect Streams', 'leads', 'table', 'ov-leads', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_overview, rid, 6, 4, 3);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Top Open Opportunities', 'opportunities', 'table', 'ov-opps', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_overview, rid, 12, 4, 4);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Threshold Alerts', 'leads', 'kpi', 'ov-insights', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_overview, rid, 6, 4, 5);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Activity Logs Feed', 'leads', 'table', 'ov-activity', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_overview, rid, 6, 4, 6);

  -- ── Pipeline → Pipeline Reports ──────────────────────────────────────────
  INSERT INTO analytics_dashboards (workspace_id, folder_id, name, icon, is_system, sort_order)
    VALUES (p_workspace_id, f_pipeline_d, 'Pipeline', 'git-branch', true, 2) RETURNING id INTO dash_pipeline;

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, metric, group_by, chart_type, is_system)
    VALUES (p_workspace_id, f_pipeline_r, 'Pipeline Stages Funnel', 'opportunities', '{"type":"count"}'::jsonb, 'stage', 'funnel', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_pipeline, rid, 12, 4, 1);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_pipeline_r, 'Opportunity Aging Pipeline', 'opportunities', 'bar', 'pi-aging', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_pipeline, rid, 6, 4, 2);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, metric, group_by, chart_type, is_system)
    VALUES (p_workspace_id, f_pipeline_r, 'Value Distributed by Stage', 'opportunities', '{"type":"sum","column":"deal_value"}'::jsonb, 'stage', 'bar', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_pipeline, rid, 6, 4, 3);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_pipeline_r, 'Opportunities List Table', 'opportunities', 'table', 'pi-opps', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_pipeline, rid, 12, 4, 4);

  -- ── Revenue Forecast → Sales Reports ─────────────────────────────────────
  INSERT INTO analytics_dashboards (workspace_id, folder_id, name, icon, is_system, sort_order)
    VALUES (p_workspace_id, f_sales_d, 'Revenue Forecast', 'dollar-sign', true, 3) RETURNING id INTO dash_revenue;

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Sales Performance Forecast vs Quota', 'opportunities', 'line', 'rv-forecast', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_revenue, rid, 12, 4, 1);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Win / Loss Reason Analysis', 'opportunities', 'donut', 'rv-winloss', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_revenue, rid, 6, 4, 2);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Revenue Distribution by Source', 'leads', 'donut', 'rv-sources', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_revenue, rid, 6, 4, 3);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, metric, group_by, chart_type, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Pipeline Value by Stage (Detail)', 'opportunities', '{"type":"sum","column":"deal_value"}'::jsonb, 'stage', 'bar', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_revenue, rid, 12, 4, 4);

  -- ── Campaign Engagement → Marketing Reports ──────────────────────────────
  INSERT INTO analytics_dashboards (workspace_id, folder_id, name, icon, is_system, sort_order)
    VALUES (p_workspace_id, f_marketing_d, 'Campaign Engagement', 'mail', true, 4) RETURNING id INTO dash_campaigns;

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, metric, group_by, chart_type, is_system)
    VALUES (p_workspace_id, f_marketing_r, 'Campaign Conversion Comparison', 'campaigns', '{"type":"avg","column":"open_rate"}'::jsonb, 'campaign_name', 'bar', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_campaigns, rid, 12, 4, 1);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_marketing_r, 'Channel Performance Radar Map', 'campaigns', 'radar', 'ca-radar', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_campaigns, rid, 6, 4, 2);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_marketing_r, 'Email Efficiency Bubble Chart', 'campaigns', 'scatter', 'ca-scatter', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_campaigns, rid, 6, 4, 3);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_marketing_r, 'Daily Campaign Email Activity', 'campaigns', 'bar', 'ca-stacked', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_campaigns, rid, 12, 4, 4);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, metric, group_by, chart_type, is_system)
    VALUES (p_workspace_id, f_marketing_r, 'Campaign Performance Leaderboard', 'campaigns', '{"type":"avg","column":"open_rate"}'::jsonb, 'campaign_name', 'table', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_campaigns, rid, 12, 4, 5);

  -- ── Activity Log → Activity Reports (all lead_activities-backed, system) ─
  INSERT INTO analytics_dashboards (workspace_id, folder_id, name, icon, is_system, sort_order)
    VALUES (p_workspace_id, f_activity_d, 'Activity Log', 'activity', true, 5) RETURNING id INTO dash_activity;

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_activity_r, 'Sales Activity Calendar Heatmap', 'leads', 'heatmap', 'ac-heatmap', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_activity, rid, 12, 4, 1);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_activity_r, 'Total Activity Type Breakdown', 'leads', 'donut', 'ac-pie', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_activity, rid, 6, 4, 2);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_activity_r, '7-Day Activity Volatility Trend', 'leads', 'line', 'ac-trend', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_activity, rid, 6, 4, 3);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_activity_r, 'Volume Distribution by Type', 'leads', 'bar', 'ac-bars', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_activity, rid, 12, 4, 4);

  -- ── Account Health → Lead Reports ────────────────────────────────────────
  INSERT INTO analytics_dashboards (workspace_id, folder_id, name, icon, is_system, sort_order)
    VALUES (p_workspace_id, f_lead_d, 'Account Health', 'shield-check', true, 6) RETURNING id INTO dash_accounts;

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_lead_r, 'Account Relationship Health', 'leads', 'bar', 'aa-health', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_accounts, rid, 6, 4, 1);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, metric, group_by, chart_type, is_system)
    VALUES (p_workspace_id, f_lead_r, 'Prospect Source Channel Audit', 'leads', '{"type":"count"}'::jsonb, 'source', 'donut', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_accounts, rid, 6, 4, 2);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_lead_r, 'Prospect Score Value Spread', 'leads', 'bar', 'aa-score', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_accounts, rid, 12, 4, 3);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_lead_r, 'Interactivity Mix Allocation', 'leads', 'donut', 'aa-mix', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_accounts, rid, 12, 4, 4);
END;
$$;


--
-- Name: seed_default_analytics_trigger_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_default_analytics_trigger_fn() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  PERFORM seed_default_analytics_for_workspace(NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: seed_default_picklists_for_workspace(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_default_picklists_for_workspace(p_workspace_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  cat_industry UUID;
  cat_interest UUID;
  cat_status UUID;
  cat_company_size UUID;
  cat_seniority UUID;
BEGIN
  INSERT INTO picklist_categories (workspace_id, key, label) VALUES (p_workspace_id, 'lead_industry', 'Industries')
    ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO cat_industry;
  INSERT INTO picklist_categories (workspace_id, key, label) VALUES (p_workspace_id, 'lead_interest_area', 'Interest Areas')
    ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO cat_interest;
  INSERT INTO picklist_categories (workspace_id, key, label) VALUES (p_workspace_id, 'lead_status', 'Lead Status')
    ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO cat_status;
  INSERT INTO picklist_categories (workspace_id, key, label) VALUES (p_workspace_id, 'lead_company_size', 'Company Size')
    ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO cat_company_size;
  INSERT INTO picklist_categories (workspace_id, key, label) VALUES (p_workspace_id, 'lead_seniority', 'Seniority')
    ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO cat_seniority;

  INSERT INTO picklist_values (category_id, value, sort_order)
    SELECT cat_industry, v, ord FROM unnest(ARRAY['Technology','Consulting','Enterprise Software','Analytics','Retail','Cloud Services','Manufacturing','Training','Healthcare','Finance']) WITH ORDINALITY AS t(v, ord)
    ON CONFLICT (category_id, value) DO NOTHING;

  INSERT INTO picklist_values (category_id, value, sort_order)
    SELECT cat_interest, v, ord FROM unnest(ARRAY['CRM Automation','SAP AI','Digital Transformation','AI Platforms','Customer Engagement','Workflow Automation','AI Personalization','Lead Nurturing','Lead Scoring']) WITH ORDINALITY AS t(v, ord)
    ON CONFLICT (category_id, value) DO NOTHING;

  INSERT INTO picklist_values (category_id, value, sort_order, is_system)
    SELECT cat_status, v, ord, (v = 'Converted') FROM unnest(ARRAY['New','Contacted','Qualified','Nurturing','Converted']) WITH ORDINALITY AS t(v, ord)
    ON CONFLICT (category_id, value) DO NOTHING;

  INSERT INTO picklist_values (category_id, value, sort_order)
    SELECT cat_company_size, v, ord FROM unnest(ARRAY['1-10','11-50','51-200','201-1000','1000+']) WITH ORDINALITY AS t(v, ord)
    ON CONFLICT (category_id, value) DO NOTHING;

  INSERT INTO picklist_values (category_id, value, sort_order)
    SELECT cat_seniority, v, ord FROM unnest(ARRAY['C-Level','VP','Director','Manager','Individual Contributor']) WITH ORDINALITY AS t(v, ord)
    ON CONFLICT (category_id, value) DO NOTHING;
END;
$$;


--
-- Name: seed_default_picklists_trigger_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_default_picklists_trigger_fn() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  PERFORM seed_default_picklists_for_workspace(NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: set_anon_lead_workspace(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_anon_lead_workspace() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE legacy_ws UUID;
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT id INTO legacy_ws FROM workspaces WHERE name = 'Legacy Workspace' LIMIT 1;
    NEW.workspace_id := legacy_ws;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_contact_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_contact_owner() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.contact_owner IS NULL THEN
    NEW.contact_owner := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_lead_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_lead_owner() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_newsletter_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_newsletter_owner() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN NEW.owner_id = auth.uid(); END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: set_workspace_from_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_workspace_from_user() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    NEW.workspace_id := get_current_workspace_id();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_workspace_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_workspace_slug() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.capture_slug IS NULL THEN
    LOOP
      NEW.capture_slug := generate_capture_slug();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM workspaces WHERE capture_slug = NEW.capture_slug);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_newsletter_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_newsletter_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: workspace_id_for_slug(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workspace_id_for_slug(slug text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  SELECT id FROM workspaces WHERE capture_slug = slug LIMIT 1
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    account_id uuid NOT NULL,
    author_user_id uuid,
    author_name text,
    outcome text DEFAULT 'Connected'::text NOT NULL,
    notes text,
    call_time timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_calls_outcome_check CHECK ((outcome = ANY (ARRAY['Connected'::text, 'Busy'::text, 'No Answer'::text, 'Left Voicemail'::text, 'Wrong Number'::text])))
);


--
-- Name: account_document_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_document_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    signed boolean DEFAULT false NOT NULL,
    signed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: account_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    account_id uuid NOT NULL,
    opportunity_id uuid,
    title text NOT NULL,
    doc_type text DEFAULT 'Proposal'::text NOT NULL,
    status text DEFAULT 'Draft'::text NOT NULL,
    owner_id uuid,
    file_url text,
    file_name text,
    content text,
    signature_required boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_documents_doc_type_check CHECK ((doc_type = ANY (ARRAY['Quote'::text, 'Proposal'::text, 'Contract'::text, 'Other'::text]))),
    CONSTRAINT account_documents_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Sent'::text, 'Viewed'::text, 'Signed'::text])))
);


--
-- Name: account_note_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_note_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    note_id uuid NOT NULL,
    author_user_id uuid,
    author_name text,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: account_note_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_note_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    file_url text NOT NULL,
    file_name text,
    file_size bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: account_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    account_id uuid NOT NULL,
    author_user_id uuid,
    author_name text,
    title text,
    body text NOT NULL,
    file_url text,
    file_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: account_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    account_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    due_at timestamp with time zone,
    reminder text,
    priority text DEFAULT 'Medium'::text NOT NULL,
    assigned_to uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_tasks_priority_check CHECK ((priority = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text]))),
    CONSTRAINT account_tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'done'::text])))
);


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    account_name character varying(200) NOT NULL,
    account_owner uuid,
    parent_account_id uuid,
    phone character varying(50),
    website character varying(500),
    industry character varying(100),
    account_type character varying(100),
    annual_revenue numeric,
    employees integer,
    ownership character varying(50),
    rating character varying(20),
    sic_code character varying(20),
    ticker_symbol character varying(20),
    billing_street text,
    billing_city character varying(100),
    billing_state character varying(100),
    billing_country character varying(100),
    billing_zip character varying(20),
    shipping_street text,
    shipping_city character varying(100),
    shipping_state character varying(100),
    shipping_country character varying(100),
    shipping_zip character varying(20),
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    domain text,
    account_status text,
    created_by text,
    updated_by text,
    fax text
);


--
-- Name: ai_column_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_column_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    prompt_template text NOT NULL,
    output_type text DEFAULT 'text'::text NOT NULL,
    source_template_id text,
    column_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    action_type text DEFAULT 'ai_text'::text NOT NULL,
    CONSTRAINT ai_column_definitions_action_type_check CHECK ((action_type = ANY (ARRAY['ai_text'::text, 'anysite_email'::text]))),
    CONSTRAINT ai_column_definitions_output_type_check CHECK ((output_type = ANY (ARRAY['text'::text, 'number'::text, 'email'::text, 'url'::text, 'boolean'::text])))
);


--
-- Name: ai_column_saved_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_column_saved_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    prompt_template text,
    output_type text DEFAULT 'text'::text NOT NULL,
    action_type text DEFAULT 'ai_text'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_column_saved_templates_action_type_check CHECK ((action_type = ANY (ARRAY['ai_text'::text, 'anysite_email'::text]))),
    CONSTRAINT ai_column_saved_templates_output_type_check CHECK ((output_type = ANY (ARRAY['text'::text, 'number'::text, 'email'::text, 'url'::text, 'boolean'::text])))
);


--
-- Name: ai_prompt_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_prompt_templates (
    prompt_id integer NOT NULL,
    template_id integer,
    prompt_name character varying(150),
    prompt_text text NOT NULL,
    ai_tone character varying(50),
    created_at timestamp with time zone DEFAULT now(),
    workspace_id uuid
);


--
-- Name: ai_prompt_templates_prompt_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_prompt_templates_prompt_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_prompt_templates_prompt_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_prompt_templates_prompt_id_seq OWNED BY public.ai_prompt_templates.prompt_id;


--
-- Name: ai_provider_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_provider_settings (
    id integer DEFAULT 1 NOT NULL,
    active_provider text DEFAULT 'openai'::text NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_provider_settings_active_provider_check CHECK ((active_provider = ANY (ARRAY['openai'::text, 'groq'::text]))),
    CONSTRAINT ai_provider_settings_id_check CHECK ((id = 1))
);


--
-- Name: ai_segment_prompt_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_segment_prompt_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    prompt text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: analytics_dashboard_widgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_dashboard_widgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    dashboard_id uuid NOT NULL,
    report_id uuid NOT NULL,
    title_override character varying(200),
    pos_x integer DEFAULT 0 NOT NULL,
    pos_y integer DEFAULT 0 NOT NULL,
    width integer DEFAULT 6 NOT NULL,
    height integer DEFAULT 4 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: analytics_dashboards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_dashboards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    folder_id uuid,
    name character varying(200) NOT NULL,
    description text,
    icon character varying(50),
    is_system boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: analytics_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    type character varying(20) NOT NULL,
    parent_folder_id uuid,
    name character varying(150) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: analytics_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    folder_id uuid,
    name character varying(200) NOT NULL,
    description text,
    data_source character varying(30) NOT NULL,
    metric jsonb DEFAULT '{"type": "count"}'::jsonb NOT NULL,
    group_by character varying(100),
    group_by_interval character varying(10),
    filters jsonb DEFAULT '[]'::jsonb NOT NULL,
    chart_type character varying(20) DEFAULT 'bar'::character varying NOT NULL,
    system_key character varying(50),
    is_system boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    chart_config jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: analytics_saved_filters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_saved_filters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name character varying(150) NOT NULL,
    filters jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assistant_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_chats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid,
    title text DEFAULT 'New chat'::text NOT NULL,
    messages jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    actor_user_id uuid,
    actor_name text,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    entity_label text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_trials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_trials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    plan_id text NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    trial_credits integer DEFAULT 150 NOT NULL,
    converted boolean DEFAULT false NOT NULL,
    converted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    email text
);


--
-- Name: blocklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocklist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    value character varying(255) NOT NULL,
    reason text,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    workspace_id uuid
);


--
-- Name: calendar_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    provider text NOT NULL,
    email text,
    access_token text,
    refresh_token text,
    token_expires_at timestamp with time zone,
    scope text,
    status text DEFAULT 'connected'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_accounts_provider_check CHECK ((provider = ANY (ARRAY['google'::text, 'microsoft'::text])))
);


--
-- Name: campaign_approval_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_approval_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    campaign_id uuid NOT NULL,
    from_status character varying(30),
    to_status character varying(30) NOT NULL,
    changed_by uuid,
    comment text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: campaign_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    campaign_id uuid NOT NULL,
    audience_id uuid,
    lead_id uuid NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    current_step integer DEFAULT 0 NOT NULL,
    next_execution_at timestamp with time zone,
    entered_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    exit_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: campaign_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    campaign_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    step_order integer DEFAULT 1 NOT NULL,
    subject character varying(255),
    body text,
    run_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    channel character varying(20) DEFAULT 'email'::character varying NOT NULL,
    action character varying(40) DEFAULT 'email'::character varying NOT NULL
);


--
-- Name: campaign_template_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_template_steps (
    step_id integer NOT NULL,
    template_id integer,
    step_number integer NOT NULL,
    step_name character varying(150),
    subject_line character varying(500),
    email_body text,
    delay_days integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    workspace_id uuid
);


--
-- Name: campaign_template_steps_step_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.campaign_template_steps_step_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: campaign_template_steps_step_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.campaign_template_steps_step_id_seq OWNED BY public.campaign_template_steps.step_id;


--
-- Name: campaign_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_templates (
    template_id integer NOT NULL,
    template_name character varying(150) NOT NULL,
    template_type character varying(100),
    description text,
    goal text,
    target_audience character varying(150),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    workspace_id uuid
);


--
-- Name: campaign_templates_template_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.campaign_templates_template_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: campaign_templates_template_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.campaign_templates_template_id_seq OWNED BY public.campaign_templates.template_id;


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_name character varying(200) NOT NULL,
    campaign_type character varying(50),
    segment_id uuid,
    subject character varying(500),
    content text,
    status character varying(20) DEFAULT 'Draft'::character varying,
    scheduled_at timestamp with time zone,
    sent_count integer DEFAULT 0,
    open_rate numeric(5,2) DEFAULT 0,
    reply_rate numeric(5,2) DEFAULT 0,
    bounce_rate numeric(5,2) DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    workspace_id uuid,
    content_is_html boolean DEFAULT true NOT NULL,
    pause_same_company_on_reply boolean DEFAULT false NOT NULL,
    approval_status character varying(30) DEFAULT 'Draft (AI-generated)'::character varying NOT NULL,
    requires_approval boolean DEFAULT true NOT NULL,
    max_active_per_lead integer DEFAULT 1 NOT NULL,
    min_days_between_campaigns integer DEFAULT 14 NOT NULL,
    CONSTRAINT campaigns_approval_status_check CHECK (((approval_status)::text = ANY ((ARRAY['Draft (AI-generated)'::character varying, 'Pending review'::character varying, 'Approved'::character varying, 'Live/Distributing'::character varying, 'Archived'::character varying])::text[])))
);


--
-- Name: chargebee_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chargebee_webhook_events (
    event_id text NOT NULL,
    event_type text,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    author_user_id uuid,
    author_name text,
    outcome text DEFAULT 'Connected'::text NOT NULL,
    notes text,
    call_time timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contact_calls_outcome_check CHECK ((outcome = ANY (ARRAY['Connected'::text, 'Busy'::text, 'No Answer'::text, 'Left Voicemail'::text, 'Wrong Number'::text])))
);


--
-- Name: contact_document_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_document_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    signed boolean DEFAULT false NOT NULL,
    signed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    title text NOT NULL,
    doc_type text DEFAULT 'Proposal'::text NOT NULL,
    status text DEFAULT 'Draft'::text NOT NULL,
    owner_id uuid,
    file_url text,
    file_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    opportunity_id uuid,
    content text,
    signature_required boolean DEFAULT false NOT NULL,
    CONSTRAINT contact_documents_doc_type_check CHECK ((doc_type = ANY (ARRAY['Quote'::text, 'Proposal'::text, 'Contract'::text, 'Other'::text]))),
    CONSTRAINT contact_documents_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Sent'::text, 'Viewed'::text, 'Signed'::text])))
);


--
-- Name: contact_note_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_note_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    note_id uuid NOT NULL,
    author_user_id uuid,
    author_name text,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_note_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_note_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    file_url text NOT NULL,
    file_name text,
    file_size bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    author_user_id uuid,
    author_name text,
    body text NOT NULL,
    file_url text,
    file_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    title text
);


--
-- Name: contact_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    due_at timestamp with time zone,
    reminder text,
    priority text DEFAULT 'Medium'::text NOT NULL,
    assigned_to uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contact_tasks_priority_check CHECK ((priority = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text]))),
    CONSTRAINT contact_tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'done'::text])))
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    account_id uuid,
    contact_owner uuid,
    salutation character varying(10),
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    email character varying(255),
    phone character varying(50),
    mobile character varying(50),
    home_phone character varying(50),
    other_phone character varying(50),
    assistant_name character varying(100),
    assistant_phone character varying(50),
    department character varying(100),
    job_title character varying(200),
    reporting_to_id uuid,
    lead_source character varying(100),
    date_of_birth date,
    mailing_street text,
    mailing_city character varying(100),
    mailing_state character varying(100),
    mailing_country character varying(100),
    mailing_zip character varying(20),
    other_street text,
    other_city character varying(100),
    other_state character varying(100),
    other_country character varying(100),
    other_zip character varying(20),
    fax character varying(50),
    email_opt_out boolean DEFAULT false NOT NULL,
    skype_id character varying(100),
    secondary_email character varying(255),
    twitter character varying(255),
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    linkedin character varying(500),
    photo_url text,
    tags text,
    rating smallint,
    industry character varying(100),
    facebook text,
    whatsapp text,
    instagram text,
    visibility text DEFAULT 'public'::text NOT NULL,
    visible_to text,
    language text,
    currency text,
    youtube text,
    pinterest text,
    CONSTRAINT contacts_rating_check CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 5)))),
    CONSTRAINT contacts_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'private'::text, 'select_people'::text])))
);


--
-- Name: credit_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_balances (
    workspace_id uuid NOT NULL,
    period_start timestamp with time zone NOT NULL,
    allocated integer DEFAULT 0 NOT NULL,
    consumed integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    balance integer GENERATED ALWAYS AS ((allocated - consumed)) STORED
);


--
-- Name: credit_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    subscription_id uuid,
    operation_type text NOT NULL,
    credits_delta integer NOT NULL,
    lead_id uuid,
    campaign_id uuid,
    status text DEFAULT 'completed'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    period_start timestamp with time zone,
    entry_type text GENERATED ALWAYS AS (operation_type) STORED,
    amount integer GENERATED ALWAYS AS (credits_delta) STORED,
    resource_type text DEFAULT 'credits'::text NOT NULL,
    CONSTRAINT credit_ledger_resource_type_check CHECK ((resource_type = ANY (ARRAY['credits'::text, 'leads'::text]))),
    CONSTRAINT credit_ledger_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'failed'::text, 'refunded'::text])))
);


--
-- Name: custom_field_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_field_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    object_type character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    label character varying(100) NOT NULL,
    type character varying(50) DEFAULT 'text'::character varying NOT NULL,
    required boolean DEFAULT false NOT NULL,
    read_only boolean DEFAULT false NOT NULL,
    options jsonb DEFAULT '[]'::jsonb,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: demo_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    industry text,
    preferred_date date NOT NULL,
    preferred_time text NOT NULL,
    purpose text,
    referral_source text,
    meet_link text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    employees text,
    monthly_revenue text
);


--
-- Name: demo_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    business_email text NOT NULL,
    phone text NOT NULL,
    industry text NOT NULL,
    employee_count text NOT NULL,
    monthly_revenue text NOT NULL,
    purpose text,
    referral_source text,
    requested_date date NOT NULL,
    requested_time text NOT NULL,
    meeting_start_at timestamp with time zone NOT NULL,
    join_url text,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT demo_requests_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'completed'::text, 'canceled'::text])))
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_name character varying(200) NOT NULL,
    subject character varying(500),
    body text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    workspace_id uuid
);


--
-- Name: email_verification_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    code_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: feature_kill_switches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_kill_switches (
    feature_key text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feature_kill_switches_feature_key_check CHECK ((feature_key = ANY (ARRAY['launch_campaign'::text, 'send_email'::text, 'send_newsletter'::text])))
);


--
-- Name: icp_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.icp_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text DEFAULT 'Default ICP'::text NOT NULL,
    definition jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    filename text NOT NULL,
    valid_rows integer DEFAULT 0 NOT NULL,
    invalid_rows integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'processing'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT import_batches_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'done'::text, 'failed'::text])))
);


--
-- Name: inbox_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    campaign_id uuid,
    direction character varying(10) NOT NULL,
    subject character varying(500),
    body text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    workspace_id uuid,
    contact_id uuid,
    to_email text,
    account_id uuid
);


--
-- Name: lead_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    activity_type character varying(50) NOT NULL,
    metadata jsonb,
    score_delta integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    workspace_id uuid
);


--
-- Name: lead_import_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_import_archive (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    imported_by_user_id uuid,
    imported_by_name text,
    source text,
    original_lead_id uuid,
    full_name text,
    email text,
    phone text,
    company_name text,
    industry text,
    interest_area text,
    linkedin text,
    website_url text,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_from_leads_at timestamp with time zone
);


--
-- Name: lead_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    author_user_id uuid,
    author_name text,
    body text NOT NULL,
    file_url text,
    file_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    subscription_id uuid,
    lead_id uuid,
    campaign_id uuid,
    operation_type text NOT NULL,
    credits_charged integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    idempotency_key text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT lead_operations_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'failed'::text, 'refunded'::text])))
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name character varying(150),
    email character varying(255),
    phone character varying(50),
    company_name character varying(200),
    industry character varying(100),
    interest_area character varying(150),
    source character varying(100),
    message text,
    linkedin character varying(500),
    website_url character varying(500),
    lead_score integer DEFAULT 0,
    status character varying(50) DEFAULT 'New'::character varying,
    verified boolean DEFAULT false,
    owner_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_subscribed boolean DEFAULT true,
    unsubscribed_at timestamp with time zone,
    workspace_id uuid,
    ai_score jsonb,
    import_batch_id uuid,
    custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    linkedin_provider_id text,
    first_name text,
    last_name text,
    job_title text,
    seniority text,
    department text,
    company_size text,
    annual_revenue text,
    email_verification_status text,
    twitter_handle text,
    street_address text,
    city text,
    state text,
    country text,
    postal_code text,
    contact_info_requested_at timestamp with time zone,
    converted_account_id uuid,
    converted_contact_id uuid,
    converted_opportunity_id uuid,
    is_favorite boolean DEFAULT false NOT NULL,
    email_opt_out boolean DEFAULT false NOT NULL,
    do_not_contact boolean DEFAULT false NOT NULL,
    email_bounced boolean DEFAULT false NOT NULL,
    locked_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    projects text[] DEFAULT '{}'::text[] NOT NULL,
    priority text DEFAULT 'Medium'::text NOT NULL,
    discovered_account_id uuid,
    CONSTRAINT lead_contact_check CHECK (((email IS NOT NULL) OR (website_url IS NOT NULL) OR (linkedin IS NOT NULL))),
    CONSTRAINT lead_identity_check CHECK (((full_name IS NOT NULL) OR (company_name IS NOT NULL))),
    CONSTRAINT leads_priority_check CHECK ((priority = ANY (ARRAY['High'::text, 'Medium'::text, 'Low'::text])))
);


--
-- Name: meetings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    location text,
    join_url text,
    provider text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    lead_id uuid,
    attendees jsonb DEFAULT '[]'::jsonb NOT NULL,
    recording_url text,
    summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    contact_id uuid,
    account_id uuid
);


--
-- Name: menus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menus (
    menu_id integer NOT NULL,
    menu_name character varying(100) NOT NULL,
    menu_description text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: menus_menu_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.menus_menu_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menus_menu_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.menus_menu_id_seq OWNED BY public.menus.menu_id;


--
-- Name: newsletter_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    newsletter_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    email character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    sent_at timestamp with time zone,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    workspace_id uuid,
    CONSTRAINT newsletter_recipients_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'failed'::character varying, 'bounced'::character varying, 'opened'::character varying, 'clicked'::character varying])::text[])))
);


--
-- Name: newsletters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    subject character varying(255),
    preheader character varying(255),
    content jsonb DEFAULT '{"blocks": []}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'Draft'::character varying,
    audience_type character varying(20) DEFAULT 'all'::character varying,
    segment_id uuid,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    recipient_count integer DEFAULT 0,
    sent_count integer DEFAULT 0,
    open_count integer DEFAULT 0,
    click_count integer DEFAULT 0,
    owner_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    workspace_id uuid,
    CONSTRAINT newsletters_audience_type_check CHECK (((audience_type)::text = ANY ((ARRAY['all'::character varying, 'segment'::character varying])::text[]))),
    CONSTRAINT newsletters_status_check CHECK (((status)::text = ANY ((ARRAY['Draft'::character varying, 'Scheduled'::character varying, 'Sending'::character varying, 'Sent'::character varying, 'Failed'::character varying])::text[])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type character varying(50),
    title character varying(255) NOT NULL,
    message text,
    link character varying(500),
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    workspace_id uuid,
    read_at timestamp with time zone
);


--
-- Name: operation_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operation_costs (
    operation_type text NOT NULL,
    credit_cost integer DEFAULT 1 NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    lead_id uuid,
    name character varying(200) DEFAULT 'Untitled deal'::character varying NOT NULL,
    company character varying(200),
    contact_name character varying(150),
    contact_email character varying(255),
    deal_value numeric(14,2) DEFAULT 0 NOT NULL,
    stage character varying(30) DEFAULT 'new'::character varying NOT NULL,
    expected_close_date date,
    notes text,
    owner_id uuid,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    account_id uuid,
    contact_id uuid,
    currency text,
    period text,
    period_value numeric,
    due_date date,
    follow_up_date date,
    source text,
    tags text,
    priority text,
    projects text,
    pipeline text,
    CONSTRAINT opportunities_priority_check CHECK (((priority IS NULL) OR (priority = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text]))))
);


--
-- Name: outreach_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    provider character varying(20) DEFAULT 'unipile'::character varying NOT NULL,
    channel character varying(20) NOT NULL,
    account_id character varying(255) NOT NULL,
    name character varying(255),
    identifier character varying(255),
    status character varying(20) DEFAULT 'connected'::character varying NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: outreach_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sequence_id uuid NOT NULL,
    workspace_id uuid,
    step_id uuid,
    lead_id uuid,
    channel character varying(20) DEFAULT 'email'::character varying NOT NULL,
    action character varying(40) DEFAULT 'email'::character varying NOT NULL,
    status character varying(20) DEFAULT 'sent'::character varying NOT NULL,
    detail text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: outreach_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sequence_id uuid NOT NULL,
    workspace_id uuid,
    lead_id uuid NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    current_step integer DEFAULT 0 NOT NULL,
    enrolled_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: outreach_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    sequence_id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    step_id uuid,
    step_order integer DEFAULT 1 NOT NULL,
    channel character varying(20) NOT NULL,
    action character varying(40) NOT NULL,
    account_id uuid,
    subject character varying(255),
    body text,
    run_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: outreach_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    lead_id uuid,
    sequence_id uuid,
    step_id uuid,
    channel text DEFAULT 'email'::text NOT NULL,
    subject text,
    body text,
    status text DEFAULT 'sent'::text NOT NULL,
    replied_at timestamp with time zone,
    sent_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT outreach_messages_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'linkedin'::text, 'sms'::text]))),
    CONSTRAINT outreach_messages_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'delivered'::text, 'opened'::text, 'clicked'::text, 'replied'::text, 'bounced'::text, 'failed'::text])))
);


--
-- Name: outreach_send_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_send_counts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    channel text NOT NULL,
    send_date date NOT NULL,
    quota integer NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outreach_send_counts_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'linkedin'::text])))
);


--
-- Name: outreach_send_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_send_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    channel text NOT NULL,
    daily_min integer NOT NULL,
    daily_max integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outreach_send_limits_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'linkedin'::text]))),
    CONSTRAINT outreach_send_limits_check CHECK ((daily_max >= daily_min)),
    CONSTRAINT outreach_send_limits_daily_min_check CHECK ((daily_min >= 0))
);


--
-- Name: outreach_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_sequences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    name character varying(255) DEFAULT 'Untitled Sequence'::character varying NOT NULL,
    description text,
    channel character varying(20) DEFAULT 'multichannel'::character varying NOT NULL,
    status character varying(20) DEFAULT 'Draft'::character varying NOT NULL,
    enrolled_count integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    reply_count integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: outreach_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sequence_id uuid NOT NULL,
    workspace_id uuid,
    step_order integer DEFAULT 1 NOT NULL,
    channel character varying(20) DEFAULT 'email'::character varying NOT NULL,
    action character varying(40) DEFAULT 'email'::character varying NOT NULL,
    delay_days integer DEFAULT 0 NOT NULL,
    subject character varying(255),
    body text,
    created_at timestamp with time zone DEFAULT now(),
    delay_unit character varying(10) DEFAULT 'days'::character varying NOT NULL
);


--
-- Name: picklist_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.picklist_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    key character varying(50) NOT NULL,
    label character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: picklist_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.picklist_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    value character varying(150) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_vendor_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_vendor_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendor_name text NOT NULL,
    plan_name text,
    monthly_cost_cents integer,
    renewal_date date,
    usage_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: processed_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processed_webhook_events (
    id text NOT NULL,
    source text NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: promotion_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    promotion_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    bonus_credits_granted integer DEFAULT 0 NOT NULL,
    bonus_leads_granted integer DEFAULT 0 NOT NULL,
    stripe_coupon_id text,
    stripe_checkout_session_id text,
    stripe_subscription_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT promotion_redemptions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text,
    description text,
    category text,
    discount_type text,
    discount_value numeric,
    stripe_coupon_id text,
    bonus_credits integer DEFAULT 0 NOT NULL,
    bonus_leads integer DEFAULT 0 NOT NULL,
    applicable_plans text[],
    max_redemptions integer,
    times_redeemed integer DEFAULT 0 NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stripe_promotion_code_id text,
    restricted_email text,
    CONSTRAINT promotions_bonus_credits_check CHECK ((bonus_credits >= 0)),
    CONSTRAINT promotions_bonus_leads_check CHECK ((bonus_leads >= 0)),
    CONSTRAINT promotions_category_check CHECK (((category IS NULL) OR (category = ANY (ARRAY['referral'::text, 'launch'::text, 'seasonal'::text, 'student'::text, 'general'::text])))),
    CONSTRAINT promotions_check CHECK (((stripe_coupon_id IS NOT NULL) OR (bonus_credits > 0) OR (bonus_leads > 0))),
    CONSTRAINT promotions_discount_type_check CHECK (((discount_type IS NULL) OR (discount_type = ANY (ARRAY['percentage'::text, 'fixed_amount'::text]))))
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    role_id integer NOT NULL,
    role_name character varying(50) NOT NULL,
    role_description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: roles_role_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_role_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_role_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_role_id_seq OWNED BY public.roles.role_id;


--
-- Name: segment_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.segment_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    segment_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now(),
    workspace_id uuid
);


--
-- Name: segment_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.segment_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    segment_id uuid NOT NULL,
    field character varying(100) NOT NULL,
    operator character varying(50) NOT NULL,
    value text,
    rule_order integer DEFAULT 0,
    workspace_id uuid
);


--
-- Name: segment_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.segment_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    segment_id uuid NOT NULL,
    grantee_type text NOT NULL,
    grantee_id text NOT NULL,
    permission_level text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT segment_shares_grantee_type_check CHECK ((grantee_type = ANY (ARRAY['user'::text, 'team'::text]))),
    CONSTRAINT segment_shares_permission_level_check CHECK ((permission_level = ANY (ARRAY['view'::text, 'edit'::text])))
);


--
-- Name: segment_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.segment_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    segment_id uuid NOT NULL,
    version_number integer NOT NULL,
    rule_json jsonb NOT NULL,
    version_label text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    segment_name character varying(200) NOT NULL,
    description text,
    segment_type character varying(50) DEFAULT 'Dynamic'::character varying,
    status character varying(20) DEFAULT 'Active'::character varying,
    logic_type character varying(10) DEFAULT 'AND'::character varying,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    workspace_id uuid,
    rule_json jsonb
);


--
-- Name: sequence_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sequence_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sequence_id uuid NOT NULL,
    step_order integer NOT NULL,
    action_type character varying(50),
    wait_days integer DEFAULT 0,
    template_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    workspace_id uuid
);


--
-- Name: sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sequences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sequence_name character varying(200) NOT NULL,
    trigger_type character varying(100),
    status character varying(20) DEFAULT 'Draft'::character varying,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    workspace_id uuid
);


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id text NOT NULL,
    name text NOT NULL,
    monthly_price_cents integer NOT NULL,
    annual_price_cents integer NOT NULL,
    credits_per_cycle integer NOT NULL,
    trial_days integer DEFAULT 0 NOT NULL,
    features jsonb DEFAULT '{}'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    price_cents integer GENERATED ALWAYS AS (monthly_price_cents) STORED,
    monthly_credits integer GENERATED ALWAYS AS (credits_per_cycle) STORED,
    allows_discovery boolean GENERATED ALWAYS AS (COALESCE(((features ->> 'discovery'::text))::boolean, false)) STORED,
    allows_reply_tracking boolean GENERATED ALWAYS AS (COALESCE(((features ->> 'reply_tracking'::text))::boolean, false)) STORED,
    leads_per_cycle integer DEFAULT 0 NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    plan_id text DEFAULT 'basic'::text NOT NULL,
    billing_interval text DEFAULT 'monthly'::text NOT NULL,
    status text DEFAULT 'trialing'::text NOT NULL,
    trial_ends_at timestamp with time zone,
    current_period_start timestamp with time zone DEFAULT now() NOT NULL,
    current_period_end timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    credits_remaining integer DEFAULT 150 NOT NULL,
    credits_total integer DEFAULT 150 NOT NULL,
    low_balance_notified_at timestamp with time zone,
    stripe_customer_id text,
    chargebee_subscription_id text,
    stripe_price_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    stripe_subscription_id text,
    credits_next_reset_at timestamp with time zone,
    last_synced_resource_version bigint,
    trial_used_at timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    billing_op_lock_at timestamp with time zone,
    leads_remaining integer DEFAULT 0 NOT NULL,
    leads_total integer DEFAULT 0 NOT NULL,
    CONSTRAINT subscriptions_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['monthly'::text, 'annual'::text]))),
    CONSTRAINT subscriptions_credits_remaining_check CHECK ((credits_remaining >= 0)),
    CONSTRAINT subscriptions_leads_remaining_check CHECK ((leads_remaining >= 0)),
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text])))
);


--
-- Name: user_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_permissions (
    permission_id integer NOT NULL,
    user_id uuid NOT NULL,
    menu_id integer NOT NULL,
    can_create boolean DEFAULT false,
    can_upload boolean DEFAULT false,
    can_delete boolean DEFAULT false,
    can_edit boolean DEFAULT false,
    can_view boolean DEFAULT true,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now(),
    workspace_id uuid
);


--
-- Name: user_permissions_permission_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_permissions_permission_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_permissions_permission_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_permissions_permission_id_seq OWNED BY public.user_permissions.permission_id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    user_id uuid NOT NULL,
    full_name character varying(150) NOT NULL,
    email character varying(255) NOT NULL,
    role_id integer,
    manager_id uuid,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    avatar_url text,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    workspace_id uuid,
    nav_access jsonb DEFAULT '{}'::jsonb,
    phone text,
    job_title text,
    tour_state jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: webhook_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text DEFAULT 'chargebee'::text NOT NULL,
    event_id text,
    event_type text,
    workspace_id uuid,
    payload jsonb,
    status text DEFAULT 'received'::text NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT webhook_logs_status_check CHECK ((status = ANY (ARRAY['received'::text, 'processed'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: workflow_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id uuid NOT NULL,
    lead_id uuid,
    status character varying(20) DEFAULT 'Running'::character varying,
    result jsonb,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    workspace_id uuid,
    phase text,
    wde_execution_id text
);


--
-- Name: workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_name character varying(200) NOT NULL,
    description text,
    folder character varying(50) DEFAULT 'Lead Generation'::character varying,
    status character varying(20) DEFAULT 'Draft'::character varying,
    config jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    workspace_id uuid
);


--
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    role_id integer NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    owner_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    capture_slug character varying(64),
    onboarding jsonb,
    onboarding_completed boolean DEFAULT false NOT NULL,
    onboarding_grandfathered boolean DEFAULT false NOT NULL
);


--
-- Name: zoom_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zoom_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    email text,
    access_token text,
    refresh_token text,
    token_expires_at timestamp with time zone,
    scope text,
    status text DEFAULT 'connected'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_prompt_templates prompt_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_templates ALTER COLUMN prompt_id SET DEFAULT nextval('public.ai_prompt_templates_prompt_id_seq'::regclass);


--
-- Name: campaign_template_steps step_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_template_steps ALTER COLUMN step_id SET DEFAULT nextval('public.campaign_template_steps_step_id_seq'::regclass);


--
-- Name: campaign_templates template_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_templates ALTER COLUMN template_id SET DEFAULT nextval('public.campaign_templates_template_id_seq'::regclass);


--
-- Name: menus menu_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menus ALTER COLUMN menu_id SET DEFAULT nextval('public.menus_menu_id_seq'::regclass);


--
-- Name: roles role_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN role_id SET DEFAULT nextval('public.roles_role_id_seq'::regclass);


--
-- Name: user_permissions permission_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions ALTER COLUMN permission_id SET DEFAULT nextval('public.user_permissions_permission_id_seq'::regclass);


--
-- Name: account_calls account_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_calls
    ADD CONSTRAINT account_calls_pkey PRIMARY KEY (id);


--
-- Name: account_document_recipients account_document_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_document_recipients
    ADD CONSTRAINT account_document_recipients_pkey PRIMARY KEY (id);


--
-- Name: account_documents account_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_documents
    ADD CONSTRAINT account_documents_pkey PRIMARY KEY (id);


--
-- Name: account_note_comments account_note_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_note_comments
    ADD CONSTRAINT account_note_comments_pkey PRIMARY KEY (id);


--
-- Name: account_note_files account_note_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_note_files
    ADD CONSTRAINT account_note_files_pkey PRIMARY KEY (id);


--
-- Name: account_notes account_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_notes
    ADD CONSTRAINT account_notes_pkey PRIMARY KEY (id);


--
-- Name: account_tasks account_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_tasks
    ADD CONSTRAINT account_tasks_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: ai_column_definitions ai_column_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_column_definitions
    ADD CONSTRAINT ai_column_definitions_pkey PRIMARY KEY (id);


--
-- Name: ai_column_saved_templates ai_column_saved_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_column_saved_templates
    ADD CONSTRAINT ai_column_saved_templates_pkey PRIMARY KEY (id);


--
-- Name: ai_prompt_templates ai_prompt_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_templates
    ADD CONSTRAINT ai_prompt_templates_pkey PRIMARY KEY (prompt_id);


--
-- Name: ai_provider_settings ai_provider_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_provider_settings
    ADD CONSTRAINT ai_provider_settings_pkey PRIMARY KEY (id);


--
-- Name: ai_segment_prompt_history ai_segment_prompt_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_segment_prompt_history
    ADD CONSTRAINT ai_segment_prompt_history_pkey PRIMARY KEY (id);


--
-- Name: analytics_dashboard_widgets analytics_dashboard_widgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_dashboard_widgets
    ADD CONSTRAINT analytics_dashboard_widgets_pkey PRIMARY KEY (id);


--
-- Name: analytics_dashboards analytics_dashboards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_dashboards
    ADD CONSTRAINT analytics_dashboards_pkey PRIMARY KEY (id);


--
-- Name: analytics_folders analytics_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_folders
    ADD CONSTRAINT analytics_folders_pkey PRIMARY KEY (id);


--
-- Name: analytics_reports analytics_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_reports
    ADD CONSTRAINT analytics_reports_pkey PRIMARY KEY (id);


--
-- Name: analytics_saved_filters analytics_saved_filters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_saved_filters
    ADD CONSTRAINT analytics_saved_filters_pkey PRIMARY KEY (id);


--
-- Name: assistant_chats assistant_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_chats
    ADD CONSTRAINT assistant_chats_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: billing_trials billing_trials_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_trials
    ADD CONSTRAINT billing_trials_email_unique UNIQUE (email);


--
-- Name: billing_trials billing_trials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_trials
    ADD CONSTRAINT billing_trials_pkey PRIMARY KEY (id);


--
-- Name: billing_trials billing_trials_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_trials
    ADD CONSTRAINT billing_trials_workspace_id_key UNIQUE (workspace_id);


--
-- Name: blocklist blocklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocklist
    ADD CONSTRAINT blocklist_pkey PRIMARY KEY (id);


--
-- Name: blocklist blocklist_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocklist
    ADD CONSTRAINT blocklist_value_key UNIQUE (value);


--
-- Name: calendar_accounts calendar_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_accounts
    ADD CONSTRAINT calendar_accounts_pkey PRIMARY KEY (id);


--
-- Name: calendar_accounts calendar_accounts_workspace_id_provider_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_accounts
    ADD CONSTRAINT calendar_accounts_workspace_id_provider_email_key UNIQUE (workspace_id, provider, email);


--
-- Name: campaign_approval_log campaign_approval_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_approval_log
    ADD CONSTRAINT campaign_approval_log_pkey PRIMARY KEY (id);


--
-- Name: campaign_enrollments campaign_enrollments_campaign_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_enrollments
    ADD CONSTRAINT campaign_enrollments_campaign_id_lead_id_key UNIQUE (campaign_id, lead_id);


--
-- Name: campaign_enrollments campaign_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_enrollments
    ADD CONSTRAINT campaign_enrollments_pkey PRIMARY KEY (id);


--
-- Name: campaign_jobs campaign_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_jobs
    ADD CONSTRAINT campaign_jobs_pkey PRIMARY KEY (id);


--
-- Name: campaign_template_steps campaign_template_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_template_steps
    ADD CONSTRAINT campaign_template_steps_pkey PRIMARY KEY (step_id);


--
-- Name: campaign_templates campaign_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_templates
    ADD CONSTRAINT campaign_templates_pkey PRIMARY KEY (template_id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: chargebee_webhook_events chargebee_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chargebee_webhook_events
    ADD CONSTRAINT chargebee_webhook_events_pkey PRIMARY KEY (event_id);


--
-- Name: contact_calls contact_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_calls
    ADD CONSTRAINT contact_calls_pkey PRIMARY KEY (id);


--
-- Name: contact_document_recipients contact_document_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_document_recipients
    ADD CONSTRAINT contact_document_recipients_pkey PRIMARY KEY (id);


--
-- Name: contact_documents contact_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_documents
    ADD CONSTRAINT contact_documents_pkey PRIMARY KEY (id);


--
-- Name: contact_note_comments contact_note_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_note_comments
    ADD CONSTRAINT contact_note_comments_pkey PRIMARY KEY (id);


--
-- Name: contact_note_files contact_note_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_note_files
    ADD CONSTRAINT contact_note_files_pkey PRIMARY KEY (id);


--
-- Name: contact_notes contact_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_notes
    ADD CONSTRAINT contact_notes_pkey PRIMARY KEY (id);


--
-- Name: contact_tasks contact_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tasks
    ADD CONSTRAINT contact_tasks_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: credit_balances credit_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_balances
    ADD CONSTRAINT credit_balances_pkey PRIMARY KEY (workspace_id, period_start);


--
-- Name: credit_ledger credit_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger
    ADD CONSTRAINT credit_ledger_pkey PRIMARY KEY (id);


--
-- Name: custom_field_definitions custom_field_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_pkey PRIMARY KEY (id);


--
-- Name: custom_field_definitions custom_field_definitions_workspace_id_object_type_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_workspace_id_object_type_name_key UNIQUE (workspace_id, object_type, name);


--
-- Name: demo_bookings demo_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_bookings
    ADD CONSTRAINT demo_bookings_pkey PRIMARY KEY (id);


--
-- Name: demo_requests demo_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_requests
    ADD CONSTRAINT demo_requests_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: email_verification_codes email_verification_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_codes
    ADD CONSTRAINT email_verification_codes_pkey PRIMARY KEY (id);


--
-- Name: feature_kill_switches feature_kill_switches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_kill_switches
    ADD CONSTRAINT feature_kill_switches_pkey PRIMARY KEY (feature_key);


--
-- Name: icp_profiles icp_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.icp_profiles
    ADD CONSTRAINT icp_profiles_pkey PRIMARY KEY (id);


--
-- Name: import_batches import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_batches
    ADD CONSTRAINT import_batches_pkey PRIMARY KEY (id);


--
-- Name: inbox_messages inbox_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_pkey PRIMARY KEY (id);


--
-- Name: lead_activities lead_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_pkey PRIMARY KEY (id);


--
-- Name: lead_import_archive lead_import_archive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_import_archive
    ADD CONSTRAINT lead_import_archive_pkey PRIMARY KEY (id);


--
-- Name: lead_notes lead_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_pkey PRIMARY KEY (id);


--
-- Name: lead_operations lead_operations_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_operations
    ADD CONSTRAINT lead_operations_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: lead_operations lead_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_operations
    ADD CONSTRAINT lead_operations_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: meetings meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_pkey PRIMARY KEY (id);


--
-- Name: menus menus_menu_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menus
    ADD CONSTRAINT menus_menu_name_key UNIQUE (menu_name);


--
-- Name: menus menus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menus
    ADD CONSTRAINT menus_pkey PRIMARY KEY (menu_id);


--
-- Name: newsletter_recipients newsletter_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_recipients
    ADD CONSTRAINT newsletter_recipients_pkey PRIMARY KEY (id);


--
-- Name: newsletters newsletters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletters
    ADD CONSTRAINT newsletters_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: operation_costs operation_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operation_costs
    ADD CONSTRAINT operation_costs_pkey PRIMARY KEY (operation_type);


--
-- Name: opportunities opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_pkey PRIMARY KEY (id);


--
-- Name: outreach_accounts outreach_accounts_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_accounts
    ADD CONSTRAINT outreach_accounts_account_id_key UNIQUE (account_id);


--
-- Name: outreach_accounts outreach_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_accounts
    ADD CONSTRAINT outreach_accounts_pkey PRIMARY KEY (id);


--
-- Name: outreach_accounts outreach_accounts_workspace_id_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_accounts
    ADD CONSTRAINT outreach_accounts_workspace_id_account_id_key UNIQUE (workspace_id, account_id);


--
-- Name: outreach_activities outreach_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_activities
    ADD CONSTRAINT outreach_activities_pkey PRIMARY KEY (id);


--
-- Name: outreach_enrollments outreach_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_enrollments
    ADD CONSTRAINT outreach_enrollments_pkey PRIMARY KEY (id);


--
-- Name: outreach_enrollments outreach_enrollments_sequence_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_enrollments
    ADD CONSTRAINT outreach_enrollments_sequence_id_lead_id_key UNIQUE (sequence_id, lead_id);


--
-- Name: outreach_jobs outreach_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_jobs
    ADD CONSTRAINT outreach_jobs_pkey PRIMARY KEY (id);


--
-- Name: outreach_messages outreach_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_messages
    ADD CONSTRAINT outreach_messages_pkey PRIMARY KEY (id);


--
-- Name: outreach_send_counts outreach_send_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_send_counts
    ADD CONSTRAINT outreach_send_counts_pkey PRIMARY KEY (id);


--
-- Name: outreach_send_counts outreach_send_counts_workspace_id_channel_send_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_send_counts
    ADD CONSTRAINT outreach_send_counts_workspace_id_channel_send_date_key UNIQUE (workspace_id, channel, send_date);


--
-- Name: outreach_send_limits outreach_send_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_send_limits
    ADD CONSTRAINT outreach_send_limits_pkey PRIMARY KEY (id);


--
-- Name: outreach_send_limits outreach_send_limits_workspace_id_channel_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_send_limits
    ADD CONSTRAINT outreach_send_limits_workspace_id_channel_key UNIQUE (workspace_id, channel);


--
-- Name: outreach_sequences outreach_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_sequences
    ADD CONSTRAINT outreach_sequences_pkey PRIMARY KEY (id);


--
-- Name: outreach_steps outreach_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_steps
    ADD CONSTRAINT outreach_steps_pkey PRIMARY KEY (id);


--
-- Name: picklist_categories picklist_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picklist_categories
    ADD CONSTRAINT picklist_categories_pkey PRIMARY KEY (id);


--
-- Name: picklist_categories picklist_categories_workspace_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picklist_categories
    ADD CONSTRAINT picklist_categories_workspace_id_key_key UNIQUE (workspace_id, key);


--
-- Name: picklist_values picklist_values_category_id_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picklist_values
    ADD CONSTRAINT picklist_values_category_id_value_key UNIQUE (category_id, value);


--
-- Name: picklist_values picklist_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picklist_values
    ADD CONSTRAINT picklist_values_pkey PRIMARY KEY (id);


--
-- Name: platform_vendor_subscriptions platform_vendor_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_vendor_subscriptions
    ADD CONSTRAINT platform_vendor_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: processed_webhook_events processed_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processed_webhook_events
    ADD CONSTRAINT processed_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: promotion_redemptions promotion_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_redemptions
    ADD CONSTRAINT promotion_redemptions_pkey PRIMARY KEY (id);


--
-- Name: promotions promotions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_code_key UNIQUE (code);


--
-- Name: promotions promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (role_id);


--
-- Name: roles roles_role_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_role_name_key UNIQUE (role_name);


--
-- Name: segment_members segment_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segment_members
    ADD CONSTRAINT segment_members_pkey PRIMARY KEY (id);


--
-- Name: segment_members segment_members_segment_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segment_members
    ADD CONSTRAINT segment_members_segment_id_lead_id_key UNIQUE (segment_id, lead_id);


--
-- Name: segment_rules segment_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segment_rules
    ADD CONSTRAINT segment_rules_pkey PRIMARY KEY (id);


--
-- Name: segment_shares segment_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segment_shares
    ADD CONSTRAINT segment_shares_pkey PRIMARY KEY (id);


--
-- Name: segment_shares segment_shares_segment_id_grantee_type_grantee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segment_shares
    ADD CONSTRAINT segment_shares_segment_id_grantee_type_grantee_id_key UNIQUE (segment_id, grantee_type, grantee_id);


--
-- Name: segment_versions segment_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segment_versions
    ADD CONSTRAINT segment_versions_pkey PRIMARY KEY (id);


--
-- Name: segments segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segments
    ADD CONSTRAINT segments_pkey PRIMARY KEY (id);


--
-- Name: sequence_steps sequence_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_steps
    ADD CONSTRAINT sequence_steps_pkey PRIMARY KEY (id);


--
-- Name: sequences sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequences
    ADD CONSTRAINT sequences_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_chargebee_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_chargebee_subscription_id_key UNIQUE (chargebee_subscription_id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_workspace_id_key UNIQUE (workspace_id);


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (permission_id);


--
-- Name: user_permissions user_permissions_user_id_menu_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_menu_id_key UNIQUE (user_id, menu_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: webhook_logs webhook_logs_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_event_id_key UNIQUE (event_id);


--
-- Name: webhook_logs webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: workflow_executions workflow_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_pkey PRIMARY KEY (id);


--
-- Name: workflows workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);


--
-- Name: workspace_members workspace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (id);


--
-- Name: workspace_members workspace_members_user_id_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_workspace_id_key UNIQUE (user_id, workspace_id);


--
-- Name: workspaces workspaces_capture_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_capture_slug_key UNIQUE (capture_slug);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: zoom_accounts zoom_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zoom_accounts
    ADD CONSTRAINT zoom_accounts_pkey PRIMARY KEY (id);


--
-- Name: zoom_accounts zoom_accounts_workspace_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zoom_accounts
    ADD CONSTRAINT zoom_accounts_workspace_id_email_key UNIQUE (workspace_id, email);


--
-- Name: account_calls_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_calls_account_idx ON public.account_calls USING btree (account_id, call_time DESC);


--
-- Name: account_document_recipients_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_document_recipients_doc_idx ON public.account_document_recipients USING btree (document_id);


--
-- Name: account_documents_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_documents_account_idx ON public.account_documents USING btree (account_id, created_at DESC);


--
-- Name: account_documents_opportunity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_documents_opportunity_idx ON public.account_documents USING btree (opportunity_id);


--
-- Name: account_note_comments_note_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_note_comments_note_idx ON public.account_note_comments USING btree (note_id, created_at);


--
-- Name: account_note_files_note_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_note_files_note_idx ON public.account_note_files USING btree (note_id);


--
-- Name: account_notes_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_notes_account_idx ON public.account_notes USING btree (account_id, created_at DESC);


--
-- Name: account_tasks_account_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_tasks_account_due_idx ON public.account_tasks USING btree (account_id, due_at);


--
-- Name: accounts_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounts_owner_idx ON public.accounts USING btree (account_owner);


--
-- Name: accounts_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounts_parent_idx ON public.accounts USING btree (parent_account_id);


--
-- Name: accounts_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounts_workspace_idx ON public.accounts USING btree (workspace_id);


--
-- Name: ai_column_definitions_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_column_definitions_workspace_idx ON public.ai_column_definitions USING btree (workspace_id, column_order);


--
-- Name: ai_column_saved_templates_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_column_saved_templates_workspace_idx ON public.ai_column_saved_templates USING btree (workspace_id, created_at DESC);


--
-- Name: audit_log_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_workspace_idx ON public.audit_log USING btree (workspace_id, created_at DESC);


--
-- Name: billing_trials_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_trials_workspace_idx ON public.billing_trials USING btree (workspace_id);


--
-- Name: calendar_accounts_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_accounts_workspace_idx ON public.calendar_accounts USING btree (workspace_id);


--
-- Name: contact_calls_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_calls_contact_idx ON public.contact_calls USING btree (contact_id, call_time DESC);


--
-- Name: contact_document_recipients_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_document_recipients_doc_idx ON public.contact_document_recipients USING btree (document_id);


--
-- Name: contact_documents_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_documents_contact_idx ON public.contact_documents USING btree (contact_id, created_at DESC);


--
-- Name: contact_documents_opportunity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_documents_opportunity_idx ON public.contact_documents USING btree (opportunity_id);


--
-- Name: contact_note_comments_note_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_note_comments_note_idx ON public.contact_note_comments USING btree (note_id, created_at);


--
-- Name: contact_note_files_note_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_note_files_note_idx ON public.contact_note_files USING btree (note_id);


--
-- Name: contact_notes_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_notes_contact_idx ON public.contact_notes USING btree (contact_id, created_at DESC);


--
-- Name: contact_tasks_contact_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_tasks_contact_due_idx ON public.contact_tasks USING btree (contact_id, due_at);


--
-- Name: contacts_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_account_idx ON public.contacts USING btree (account_id);


--
-- Name: contacts_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_owner_idx ON public.contacts USING btree (contact_owner);


--
-- Name: contacts_reporting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_reporting_idx ON public.contacts USING btree (reporting_to_id);


--
-- Name: contacts_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_workspace_idx ON public.contacts USING btree (workspace_id);


--
-- Name: credit_balances_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX credit_balances_workspace_idx ON public.credit_balances USING btree (workspace_id, period_start DESC);


--
-- Name: credit_ledger_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX credit_ledger_workspace_idx ON public.credit_ledger USING btree (workspace_id, created_at DESC);


--
-- Name: demo_bookings_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX demo_bookings_date_idx ON public.demo_bookings USING btree (preferred_date);


--
-- Name: email_verification_codes_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_verification_codes_user_idx ON public.email_verification_codes USING btree (user_id);


--
-- Name: icp_profiles_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX icp_profiles_workspace_idx ON public.icp_profiles USING btree (workspace_id);


--
-- Name: idx_activities_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_lead ON public.lead_activities USING btree (lead_id, created_at DESC);


--
-- Name: idx_ai_segment_prompt_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_segment_prompt_history_user ON public.ai_segment_prompt_history USING btree (user_id, created_at DESC);


--
-- Name: idx_analytics_dashboards_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_dashboards_workspace ON public.analytics_dashboards USING btree (workspace_id, folder_id);


--
-- Name: idx_analytics_folders_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_folders_workspace ON public.analytics_folders USING btree (workspace_id, type, parent_folder_id);


--
-- Name: idx_analytics_reports_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_reports_workspace ON public.analytics_reports USING btree (workspace_id, folder_id);


--
-- Name: idx_analytics_saved_filters_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_saved_filters_workspace ON public.analytics_saved_filters USING btree (workspace_id);


--
-- Name: idx_analytics_widgets_dashboard; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_widgets_dashboard ON public.analytics_dashboard_widgets USING btree (dashboard_id, sort_order);


--
-- Name: idx_assistant_chats_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistant_chats_user ON public.assistant_chats USING btree (user_id, updated_at DESC);


--
-- Name: idx_blocklist_value; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocklist_value ON public.blocklist USING btree (lower((value)::text));


--
-- Name: idx_campaign_approval_log_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_approval_log_campaign ON public.campaign_approval_log USING btree (campaign_id, created_at);


--
-- Name: idx_campaign_enrollments_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_enrollments_campaign ON public.campaign_enrollments USING btree (campaign_id);


--
-- Name: idx_campaign_enrollments_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_enrollments_lead ON public.campaign_enrollments USING btree (lead_id);


--
-- Name: idx_campaign_enrollments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_enrollments_status ON public.campaign_enrollments USING btree (status);


--
-- Name: idx_campaign_jobs_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_jobs_campaign ON public.campaign_jobs USING btree (campaign_id);


--
-- Name: idx_campaign_jobs_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_jobs_due ON public.campaign_jobs USING btree (status, run_at);


--
-- Name: idx_campaign_jobs_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_jobs_lead ON public.campaign_jobs USING btree (lead_id);


--
-- Name: idx_campaigns_segment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_segment_id ON public.campaigns USING btree (segment_id) WHERE (segment_id IS NOT NULL);


--
-- Name: idx_campaigns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status);


--
-- Name: idx_chargebee_webhook_events_processed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chargebee_webhook_events_processed_at ON public.chargebee_webhook_events USING btree (processed_at);


--
-- Name: idx_credit_ledger_operation_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_ledger_operation_type ON public.credit_ledger USING btree (operation_type);


--
-- Name: idx_custom_fields_workspace_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_fields_workspace_object ON public.custom_field_definitions USING btree (workspace_id, object_type);


--
-- Name: idx_demo_requests_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_demo_requests_created ON public.demo_requests USING btree (created_at DESC);


--
-- Name: idx_executions_workflow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_executions_workflow ON public.workflow_executions USING btree (workflow_id, started_at DESC);


--
-- Name: idx_import_batches_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_batches_workspace ON public.import_batches USING btree (workspace_id, created_at DESC);


--
-- Name: idx_inbox_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbox_account ON public.inbox_messages USING btree (account_id, created_at DESC);


--
-- Name: idx_inbox_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbox_contact ON public.inbox_messages USING btree (contact_id, created_at DESC);


--
-- Name: idx_inbox_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbox_lead ON public.inbox_messages USING btree (lead_id, created_at DESC);


--
-- Name: idx_inbox_messages_campaign_direction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbox_messages_campaign_direction ON public.inbox_messages USING btree (campaign_id, direction) WHERE (campaign_id IS NOT NULL);


--
-- Name: idx_inbox_messages_direction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbox_messages_direction ON public.inbox_messages USING btree (direction);


--
-- Name: idx_inbox_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbox_unread ON public.inbox_messages USING btree (is_read) WHERE (is_read = false);


--
-- Name: idx_lead_activities_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_activities_campaign_id ON public.lead_activities USING btree (((metadata ->> 'campaign_id'::text))) WHERE ((metadata ->> 'campaign_id'::text) IS NOT NULL);


--
-- Name: idx_lead_activities_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_activities_type ON public.lead_activities USING btree (activity_type);


--
-- Name: idx_leads_converted_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_converted_account_id ON public.leads USING btree (converted_account_id);


--
-- Name: idx_leads_converted_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_converted_contact_id ON public.leads USING btree (converted_contact_id);


--
-- Name: idx_leads_converted_opportunity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_converted_opportunity_id ON public.leads USING btree (converted_opportunity_id);


--
-- Name: idx_leads_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_created ON public.leads USING btree (created_at DESC);


--
-- Name: idx_leads_discovered_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_discovered_account ON public.leads USING btree (discovered_account_id);


--
-- Name: idx_leads_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_email ON public.leads USING btree (lower((email)::text)) WHERE (email IS NOT NULL);


--
-- Name: idx_leads_import_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_import_batch ON public.leads USING btree (import_batch_id) WHERE (import_batch_id IS NOT NULL);


--
-- Name: idx_leads_is_favorite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_is_favorite ON public.leads USING btree (is_favorite) WHERE (is_favorite = true);


--
-- Name: idx_leads_linkedin_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_linkedin_provider_id ON public.leads USING btree (linkedin_provider_id) WHERE (linkedin_provider_id IS NOT NULL);


--
-- Name: idx_leads_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_owner ON public.leads USING btree (owner_id);


--
-- Name: idx_leads_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_score ON public.leads USING btree (lead_score DESC);


--
-- Name: idx_leads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_status ON public.leads USING btree (status);


--
-- Name: idx_newsletter_recipients_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletter_recipients_lead ON public.newsletter_recipients USING btree (lead_id);


--
-- Name: idx_newsletter_recipients_newsletter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletter_recipients_newsletter ON public.newsletter_recipients USING btree (newsletter_id);


--
-- Name: idx_newsletters_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletters_owner ON public.newsletters USING btree (owner_id);


--
-- Name: idx_newsletters_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletters_status ON public.newsletters USING btree (status);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_opportunities_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opportunities_account_id ON public.opportunities USING btree (account_id);


--
-- Name: idx_opportunities_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opportunities_contact_id ON public.opportunities USING btree (contact_id);


--
-- Name: idx_opportunities_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opportunities_lead ON public.opportunities USING btree (lead_id);


--
-- Name: idx_opportunities_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opportunities_stage ON public.opportunities USING btree (stage);


--
-- Name: idx_opportunities_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opportunities_workspace ON public.opportunities USING btree (workspace_id);


--
-- Name: idx_outreach_accounts_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_accounts_ws ON public.outreach_accounts USING btree (workspace_id, channel);


--
-- Name: idx_outreach_activities_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_activities_seq ON public.outreach_activities USING btree (sequence_id);


--
-- Name: idx_outreach_enrollments_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_enrollments_seq ON public.outreach_enrollments USING btree (sequence_id);


--
-- Name: idx_outreach_jobs_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_jobs_due ON public.outreach_jobs USING btree (status, run_at);


--
-- Name: idx_outreach_jobs_enrollment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_jobs_enrollment ON public.outreach_jobs USING btree (enrollment_id);


--
-- Name: idx_outreach_messages_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_messages_lead ON public.outreach_messages USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: idx_outreach_messages_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_messages_workspace ON public.outreach_messages USING btree (workspace_id, created_at DESC);


--
-- Name: idx_outreach_steps_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_steps_seq ON public.outreach_steps USING btree (sequence_id);


--
-- Name: idx_picklist_categories_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_picklist_categories_workspace ON public.picklist_categories USING btree (workspace_id);


--
-- Name: idx_picklist_values_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_picklist_values_category ON public.picklist_values USING btree (category_id, sort_order);


--
-- Name: idx_processed_webhook_events_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_processed_webhook_events_source ON public.processed_webhook_events USING btree (source, processed_at DESC);


--
-- Name: idx_promotions_restricted_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotions_restricted_email ON public.promotions USING btree (restricted_email) WHERE (restricted_email IS NOT NULL);


--
-- Name: idx_segment_members_segment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_segment_members_segment_id ON public.segment_members USING btree (segment_id);


--
-- Name: idx_segment_shares_segment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_segment_shares_segment_id ON public.segment_shares USING btree (segment_id);


--
-- Name: idx_segment_versions_segment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_segment_versions_segment_id ON public.segment_versions USING btree (segment_id);


--
-- Name: idx_subscriptions_chargebee_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_chargebee_customer ON public.subscriptions USING btree (stripe_customer_id) WHERE (stripe_customer_id IS NOT NULL);


--
-- Name: idx_webhook_logs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_logs_type ON public.webhook_logs USING btree (event_type, created_at DESC);


--
-- Name: idx_workflow_executions_wde; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_executions_wde ON public.workflow_executions USING btree (wde_execution_id) WHERE (wde_execution_id IS NOT NULL);


--
-- Name: idx_workflow_executions_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_executions_workspace ON public.workflow_executions USING btree (workspace_id) WHERE (workspace_id IS NOT NULL);


--
-- Name: lead_import_archive_original_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_import_archive_original_lead_idx ON public.lead_import_archive USING btree (original_lead_id);


--
-- Name: lead_import_archive_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_import_archive_workspace_idx ON public.lead_import_archive USING btree (workspace_id, imported_at DESC);


--
-- Name: lead_notes_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_notes_lead_idx ON public.lead_notes USING btree (lead_id, created_at DESC);


--
-- Name: lead_operations_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_operations_lead_idx ON public.lead_operations USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: lead_operations_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_operations_workspace_idx ON public.lead_operations USING btree (workspace_id, created_at DESC);


--
-- Name: meetings_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meetings_account_idx ON public.meetings USING btree (account_id);


--
-- Name: meetings_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meetings_contact_idx ON public.meetings USING btree (contact_id);


--
-- Name: meetings_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meetings_lead_idx ON public.meetings USING btree (lead_id);


--
-- Name: meetings_workspace_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meetings_workspace_start_idx ON public.meetings USING btree (workspace_id, start_at);


--
-- Name: outreach_send_limits_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_send_limits_workspace_idx ON public.outreach_send_limits USING btree (workspace_id);


--
-- Name: promotion_redemptions_completed_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX promotion_redemptions_completed_unique ON public.promotion_redemptions USING btree (workspace_id, promotion_id) WHERE (status = 'completed'::text);


--
-- Name: promotion_redemptions_pending_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX promotion_redemptions_pending_unique ON public.promotion_redemptions USING btree (workspace_id, promotion_id) WHERE (status = 'pending'::text);


--
-- Name: promotion_redemptions_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotion_redemptions_workspace_idx ON public.promotion_redemptions USING btree (workspace_id, created_at DESC);


--
-- Name: workspace_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_members_user_idx ON public.workspace_members USING btree (user_id);


--
-- Name: workspace_members_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_members_workspace_idx ON public.workspace_members USING btree (workspace_id);


--
-- Name: zoom_accounts_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zoom_accounts_workspace_idx ON public.zoom_accounts USING btree (workspace_id);


--
-- Name: account_calls auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.account_calls FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: account_documents auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.account_documents FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: account_note_comments auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.account_note_comments FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: account_notes auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.account_notes FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: account_tasks auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.account_tasks FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: accounts auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: ai_column_definitions auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.ai_column_definitions FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: ai_column_saved_templates auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.ai_column_saved_templates FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: analytics_dashboard_widgets auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.analytics_dashboard_widgets FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: analytics_dashboards auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.analytics_dashboards FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: analytics_folders auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.analytics_folders FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: analytics_reports auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.analytics_reports FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: analytics_saved_filters auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.analytics_saved_filters FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: assistant_chats auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.assistant_chats FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: audit_log auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: blocklist auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.blocklist FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: calendar_accounts auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.calendar_accounts FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: campaign_approval_log auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.campaign_approval_log FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: campaign_enrollments auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.campaign_enrollments FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: campaign_jobs auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.campaign_jobs FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: campaigns auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: contact_calls auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.contact_calls FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: contact_documents auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.contact_documents FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: contact_note_comments auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.contact_note_comments FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: contact_notes auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.contact_notes FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: contact_tasks auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.contact_tasks FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: contacts auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: email_templates auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: inbox_messages auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.inbox_messages FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: lead_activities auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.lead_activities FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: lead_notes auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.lead_notes FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: leads auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: meetings auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: newsletter_recipients auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.newsletter_recipients FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: newsletters auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.newsletters FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: notifications auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: opportunities auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: outreach_accounts auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.outreach_accounts FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: outreach_activities auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.outreach_activities FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: outreach_enrollments auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.outreach_enrollments FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: outreach_jobs auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.outreach_jobs FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: outreach_send_limits auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.outreach_send_limits FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: outreach_sequences auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.outreach_sequences FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: outreach_steps auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.outreach_steps FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: segment_members auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.segment_members FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: segment_rules auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.segment_rules FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: segments auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.segments FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: user_permissions auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.user_permissions FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: workflow_executions auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.workflow_executions FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: workflows auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: zoom_accounts auto_workspace_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON public.zoom_accounts FOR EACH ROW EXECUTE FUNCTION public.set_workspace_from_user();


--
-- Name: credit_balances credit_balances_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER credit_balances_updated_at BEFORE UPDATE ON public.credit_balances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: icp_profiles icp_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER icp_profiles_updated_at BEFORE UPDATE ON public.icp_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: subscriptions on_subscription_activated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_subscription_activated AFTER UPDATE ON public.subscriptions FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION public.mark_trial_converted();


--
-- Name: promotions promotions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER promotions_updated_at BEFORE UPDATE ON public.promotions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: workspaces seed_default_analytics_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER seed_default_analytics_trigger AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.seed_default_analytics_trigger_fn();


--
-- Name: workspaces seed_default_picklists_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER seed_default_picklists_trigger AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.seed_default_picklists_trigger_fn();


--
-- Name: newsletters set_newsletter_owner_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_newsletter_owner_trigger BEFORE INSERT ON public.newsletters FOR EACH ROW EXECUTE FUNCTION public.set_newsletter_owner();


--
-- Name: ai_column_definitions set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.ai_column_definitions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: calendar_accounts set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.calendar_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: meetings set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: outreach_send_limits set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.outreach_send_limits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: platform_vendor_subscriptions set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.platform_vendor_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: zoom_accounts set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.zoom_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: workspaces set_workspace_slug_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_workspace_slug_trigger BEFORE INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.set_workspace_slug();


--
-- Name: subscriptions subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: account_tasks trg_account_tasks_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_account_tasks_updated BEFORE UPDATE ON public.account_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: accounts trg_accounts_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_accounts_updated BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: analytics_dashboard_widgets trg_analytics_dashboard_widgets_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_analytics_dashboard_widgets_updated BEFORE UPDATE ON public.analytics_dashboard_widgets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: analytics_dashboards trg_analytics_dashboards_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_analytics_dashboards_updated BEFORE UPDATE ON public.analytics_dashboards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: analytics_folders trg_analytics_folders_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_analytics_folders_updated BEFORE UPDATE ON public.analytics_folders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: analytics_reports trg_analytics_reports_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_analytics_reports_updated BEFORE UPDATE ON public.analytics_reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: analytics_saved_filters trg_analytics_saved_filters_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_analytics_saved_filters_updated BEFORE UPDATE ON public.analytics_saved_filters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: campaigns trg_campaigns_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: contact_tasks trg_contact_tasks_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_contact_tasks_updated BEFORE UPDATE ON public.contact_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: contacts trg_contacts_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: custom_field_definitions trg_custom_field_definitions_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_custom_field_definitions_updated BEFORE UPDATE ON public.custom_field_definitions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: email_templates trg_email_templates_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_email_templates_updated BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: leads trg_leads_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: picklist_values trg_picklist_values_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_picklist_values_updated BEFORE UPDATE ON public.picklist_values FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: segments trg_segments_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_segments_updated BEFORE UPDATE ON public.segments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: contacts trg_set_contact_owner; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_contact_owner BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_contact_owner();


--
-- Name: leads trg_set_lead_owner; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_lead_owner BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_lead_owner();


--
-- Name: users trg_users_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: workflows trg_workflows_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_workflows_updated BEFORE UPDATE ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: workspace_members trg_workspace_members_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_workspace_members_updated BEFORE UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: newsletters update_newsletter_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_newsletter_updated_at_trigger BEFORE UPDATE ON public.newsletters FOR EACH ROW EXECUTE FUNCTION public.update_newsletter_updated_at();


--
-- Name: account_calls account_calls_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_calls
    ADD CONSTRAINT account_calls_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: account_calls account_calls_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_calls
    ADD CONSTRAINT account_calls_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: account_calls account_calls_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_calls
    ADD CONSTRAINT account_calls_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: account_document_recipients account_document_recipients_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_document_recipients
    ADD CONSTRAINT account_document_recipients_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.account_documents(id) ON DELETE CASCADE;


--
-- Name: account_documents account_documents_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_documents
    ADD CONSTRAINT account_documents_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: account_documents account_documents_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_documents
    ADD CONSTRAINT account_documents_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
-- Name: account_documents account_documents_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_documents
    ADD CONSTRAINT account_documents_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: account_documents account_documents_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_documents
    ADD CONSTRAINT account_documents_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: account_note_comments account_note_comments_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_note_comments
    ADD CONSTRAINT account_note_comments_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: account_note_comments account_note_comments_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_note_comments
    ADD CONSTRAINT account_note_comments_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.account_notes(id) ON DELETE CASCADE;


--
-- Name: account_note_comments account_note_comments_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_note_comments
    ADD CONSTRAINT account_note_comments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: account_note_files account_note_files_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_note_files
    ADD CONSTRAINT account_note_files_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.account_notes(id) ON DELETE CASCADE;


--
-- Name: account_notes account_notes_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_notes
    ADD CONSTRAINT account_notes_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: account_notes account_notes_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_notes
    ADD CONSTRAINT account_notes_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: account_notes account_notes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_notes
    ADD CONSTRAINT account_notes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: account_tasks account_tasks_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_tasks
    ADD CONSTRAINT account_tasks_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: account_tasks account_tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_tasks
    ADD CONSTRAINT account_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: account_tasks account_tasks_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_tasks
    ADD CONSTRAINT account_tasks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: accounts accounts_account_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_account_owner_fkey FOREIGN KEY (account_owner) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: accounts accounts_parent_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_parent_account_id_fkey FOREIGN KEY (parent_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: accounts accounts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: ai_column_definitions ai_column_definitions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_column_definitions
    ADD CONSTRAINT ai_column_definitions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: ai_column_definitions ai_column_definitions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_column_definitions
    ADD CONSTRAINT ai_column_definitions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: ai_column_saved_templates ai_column_saved_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_column_saved_templates
    ADD CONSTRAINT ai_column_saved_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: ai_column_saved_templates ai_column_saved_templates_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_column_saved_templates
    ADD CONSTRAINT ai_column_saved_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: ai_prompt_templates ai_prompt_templates_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_templates
    ADD CONSTRAINT ai_prompt_templates_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.campaign_templates(template_id) ON DELETE CASCADE;


--
-- Name: ai_prompt_templates ai_prompt_templates_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_templates
    ADD CONSTRAINT ai_prompt_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: ai_provider_settings ai_provider_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_provider_settings
    ADD CONSTRAINT ai_provider_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: ai_segment_prompt_history ai_segment_prompt_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_segment_prompt_history
    ADD CONSTRAINT ai_segment_prompt_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ai_segment_prompt_history ai_segment_prompt_history_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_segment_prompt_history
    ADD CONSTRAINT ai_segment_prompt_history_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: analytics_dashboard_widgets analytics_dashboard_widgets_dashboard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_dashboard_widgets
    ADD CONSTRAINT analytics_dashboard_widgets_dashboard_id_fkey FOREIGN KEY (dashboard_id) REFERENCES public.analytics_dashboards(id) ON DELETE CASCADE;


--
-- Name: analytics_dashboard_widgets analytics_dashboard_widgets_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_dashboard_widgets
    ADD CONSTRAINT analytics_dashboard_widgets_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.analytics_reports(id) ON DELETE CASCADE;


--
-- Name: analytics_dashboard_widgets analytics_dashboard_widgets_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_dashboard_widgets
    ADD CONSTRAINT analytics_dashboard_widgets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: analytics_dashboards analytics_dashboards_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_dashboards
    ADD CONSTRAINT analytics_dashboards_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: analytics_dashboards analytics_dashboards_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_dashboards
    ADD CONSTRAINT analytics_dashboards_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.analytics_folders(id) ON DELETE SET NULL;


--
-- Name: analytics_dashboards analytics_dashboards_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_dashboards
    ADD CONSTRAINT analytics_dashboards_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: analytics_folders analytics_folders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_folders
    ADD CONSTRAINT analytics_folders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: analytics_folders analytics_folders_parent_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_folders
    ADD CONSTRAINT analytics_folders_parent_folder_id_fkey FOREIGN KEY (parent_folder_id) REFERENCES public.analytics_folders(id) ON DELETE CASCADE;


--
-- Name: analytics_folders analytics_folders_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_folders
    ADD CONSTRAINT analytics_folders_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: analytics_reports analytics_reports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_reports
    ADD CONSTRAINT analytics_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: analytics_reports analytics_reports_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_reports
    ADD CONSTRAINT analytics_reports_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.analytics_folders(id) ON DELETE SET NULL;


--
-- Name: analytics_reports analytics_reports_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_reports
    ADD CONSTRAINT analytics_reports_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: analytics_saved_filters analytics_saved_filters_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_saved_filters
    ADD CONSTRAINT analytics_saved_filters_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: analytics_saved_filters analytics_saved_filters_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_saved_filters
    ADD CONSTRAINT analytics_saved_filters_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: assistant_chats assistant_chats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_chats
    ADD CONSTRAINT assistant_chats_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: assistant_chats assistant_chats_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_chats
    ADD CONSTRAINT assistant_chats_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: billing_trials billing_trials_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_trials
    ADD CONSTRAINT billing_trials_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: billing_trials billing_trials_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_trials
    ADD CONSTRAINT billing_trials_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: blocklist blocklist_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocklist
    ADD CONSTRAINT blocklist_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: blocklist blocklist_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocklist
    ADD CONSTRAINT blocklist_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: calendar_accounts calendar_accounts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_accounts
    ADD CONSTRAINT calendar_accounts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: campaign_approval_log campaign_approval_log_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_approval_log
    ADD CONSTRAINT campaign_approval_log_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_approval_log campaign_approval_log_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_approval_log
    ADD CONSTRAINT campaign_approval_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(user_id);


--
-- Name: campaign_approval_log campaign_approval_log_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_approval_log
    ADD CONSTRAINT campaign_approval_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: campaign_enrollments campaign_enrollments_audience_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_enrollments
    ADD CONSTRAINT campaign_enrollments_audience_id_fkey FOREIGN KEY (audience_id) REFERENCES public.segments(id) ON DELETE SET NULL;


--
-- Name: campaign_enrollments campaign_enrollments_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_enrollments
    ADD CONSTRAINT campaign_enrollments_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_enrollments campaign_enrollments_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_enrollments
    ADD CONSTRAINT campaign_enrollments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: campaign_enrollments campaign_enrollments_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_enrollments
    ADD CONSTRAINT campaign_enrollments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: campaign_jobs campaign_jobs_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_jobs
    ADD CONSTRAINT campaign_jobs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_jobs campaign_jobs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_jobs
    ADD CONSTRAINT campaign_jobs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: campaign_jobs campaign_jobs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_jobs
    ADD CONSTRAINT campaign_jobs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: campaign_template_steps campaign_template_steps_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_template_steps
    ADD CONSTRAINT campaign_template_steps_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.campaign_templates(template_id) ON DELETE CASCADE;


--
-- Name: campaign_template_steps campaign_template_steps_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_template_steps
    ADD CONSTRAINT campaign_template_steps_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: campaign_templates campaign_templates_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_templates
    ADD CONSTRAINT campaign_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: campaigns campaigns_segment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.segments(id) ON DELETE SET NULL;


--
-- Name: campaigns campaigns_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: contact_calls contact_calls_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_calls
    ADD CONSTRAINT contact_calls_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: contact_calls contact_calls_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_calls
    ADD CONSTRAINT contact_calls_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_calls contact_calls_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_calls
    ADD CONSTRAINT contact_calls_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: contact_document_recipients contact_document_recipients_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_document_recipients
    ADD CONSTRAINT contact_document_recipients_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.contact_documents(id) ON DELETE CASCADE;


--
-- Name: contact_documents contact_documents_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_documents
    ADD CONSTRAINT contact_documents_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_documents contact_documents_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_documents
    ADD CONSTRAINT contact_documents_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
-- Name: contact_documents contact_documents_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_documents
    ADD CONSTRAINT contact_documents_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: contact_documents contact_documents_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_documents
    ADD CONSTRAINT contact_documents_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: contact_note_comments contact_note_comments_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_note_comments
    ADD CONSTRAINT contact_note_comments_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: contact_note_comments contact_note_comments_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_note_comments
    ADD CONSTRAINT contact_note_comments_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.contact_notes(id) ON DELETE CASCADE;


--
-- Name: contact_note_comments contact_note_comments_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_note_comments
    ADD CONSTRAINT contact_note_comments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: contact_note_files contact_note_files_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_note_files
    ADD CONSTRAINT contact_note_files_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.contact_notes(id) ON DELETE CASCADE;


--
-- Name: contact_notes contact_notes_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_notes
    ADD CONSTRAINT contact_notes_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: contact_notes contact_notes_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_notes
    ADD CONSTRAINT contact_notes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_notes contact_notes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_notes
    ADD CONSTRAINT contact_notes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: contact_tasks contact_tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tasks
    ADD CONSTRAINT contact_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: contact_tasks contact_tasks_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tasks
    ADD CONSTRAINT contact_tasks_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_tasks contact_tasks_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tasks
    ADD CONSTRAINT contact_tasks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_contact_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_contact_owner_fkey FOREIGN KEY (contact_owner) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: contacts contacts_reporting_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_reporting_to_id_fkey FOREIGN KEY (reporting_to_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: credit_balances credit_balances_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_balances
    ADD CONSTRAINT credit_balances_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: credit_ledger credit_ledger_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger
    ADD CONSTRAINT credit_ledger_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id);


--
-- Name: credit_ledger credit_ledger_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger
    ADD CONSTRAINT credit_ledger_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: custom_field_definitions custom_field_definitions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: email_templates email_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: email_templates email_templates_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: email_verification_codes email_verification_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_codes
    ADD CONSTRAINT email_verification_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: feature_kill_switches feature_kill_switches_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_kill_switches
    ADD CONSTRAINT feature_kill_switches_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: icp_profiles icp_profiles_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.icp_profiles
    ADD CONSTRAINT icp_profiles_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: import_batches import_batches_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_batches
    ADD CONSTRAINT import_batches_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: inbox_messages inbox_messages_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: inbox_messages inbox_messages_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: inbox_messages inbox_messages_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: inbox_messages inbox_messages_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: inbox_messages inbox_messages_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: lead_activities lead_activities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_activities lead_activities_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: lead_import_archive lead_import_archive_imported_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_import_archive
    ADD CONSTRAINT lead_import_archive_imported_by_user_id_fkey FOREIGN KEY (imported_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: lead_import_archive lead_import_archive_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_import_archive
    ADD CONSTRAINT lead_import_archive_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: lead_notes lead_notes_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: lead_notes lead_notes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_notes lead_notes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: lead_operations lead_operations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_operations
    ADD CONSTRAINT lead_operations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: lead_operations lead_operations_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_operations
    ADD CONSTRAINT lead_operations_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id);


--
-- Name: lead_operations lead_operations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_operations
    ADD CONSTRAINT lead_operations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: leads leads_converted_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_converted_account_id_fkey FOREIGN KEY (converted_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: leads leads_converted_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_converted_contact_id_fkey FOREIGN KEY (converted_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: leads leads_converted_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_converted_opportunity_id_fkey FOREIGN KEY (converted_opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
-- Name: leads leads_discovered_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_discovered_account_id_fkey FOREIGN KEY (discovered_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: leads leads_import_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.import_batches(id) ON DELETE SET NULL;


--
-- Name: leads leads_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: leads leads_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: meetings meetings_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: meetings meetings_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: meetings meetings_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: meetings meetings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: newsletter_recipients newsletter_recipients_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_recipients
    ADD CONSTRAINT newsletter_recipients_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: newsletter_recipients newsletter_recipients_newsletter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_recipients
    ADD CONSTRAINT newsletter_recipients_newsletter_id_fkey FOREIGN KEY (newsletter_id) REFERENCES public.newsletters(id) ON DELETE CASCADE;


--
-- Name: newsletter_recipients newsletter_recipients_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_recipients
    ADD CONSTRAINT newsletter_recipients_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: newsletters newsletters_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletters
    ADD CONSTRAINT newsletters_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: newsletters newsletters_segment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletters
    ADD CONSTRAINT newsletters_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.segments(id) ON DELETE SET NULL;


--
-- Name: newsletters newsletters_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletters
    ADD CONSTRAINT newsletters_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: opportunities opportunities_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: outreach_accounts outreach_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_accounts
    ADD CONSTRAINT outreach_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: outreach_accounts outreach_accounts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_accounts
    ADD CONSTRAINT outreach_accounts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: outreach_activities outreach_activities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_activities
    ADD CONSTRAINT outreach_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: outreach_activities outreach_activities_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_activities
    ADD CONSTRAINT outreach_activities_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.outreach_sequences(id) ON DELETE CASCADE;


--
-- Name: outreach_activities outreach_activities_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_activities
    ADD CONSTRAINT outreach_activities_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.outreach_steps(id) ON DELETE SET NULL;


--
-- Name: outreach_activities outreach_activities_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_activities
    ADD CONSTRAINT outreach_activities_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: outreach_enrollments outreach_enrollments_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_enrollments
    ADD CONSTRAINT outreach_enrollments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: outreach_enrollments outreach_enrollments_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_enrollments
    ADD CONSTRAINT outreach_enrollments_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.outreach_sequences(id) ON DELETE CASCADE;


--
-- Name: outreach_enrollments outreach_enrollments_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_enrollments
    ADD CONSTRAINT outreach_enrollments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: outreach_jobs outreach_jobs_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_jobs
    ADD CONSTRAINT outreach_jobs_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.outreach_accounts(id) ON DELETE SET NULL;


--
-- Name: outreach_jobs outreach_jobs_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_jobs
    ADD CONSTRAINT outreach_jobs_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.outreach_enrollments(id) ON DELETE CASCADE;


--
-- Name: outreach_jobs outreach_jobs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_jobs
    ADD CONSTRAINT outreach_jobs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: outreach_jobs outreach_jobs_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_jobs
    ADD CONSTRAINT outreach_jobs_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.outreach_sequences(id) ON DELETE CASCADE;


--
-- Name: outreach_jobs outreach_jobs_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_jobs
    ADD CONSTRAINT outreach_jobs_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.outreach_steps(id) ON DELETE SET NULL;


--
-- Name: outreach_jobs outreach_jobs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_jobs
    ADD CONSTRAINT outreach_jobs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: outreach_messages outreach_messages_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_messages
    ADD CONSTRAINT outreach_messages_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: outreach_messages outreach_messages_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_messages
    ADD CONSTRAINT outreach_messages_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.outreach_sequences(id) ON DELETE SET NULL;


--
-- Name: outreach_messages outreach_messages_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_messages
    ADD CONSTRAINT outreach_messages_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.outreach_steps(id) ON DELETE SET NULL;


--
-- Name: outreach_messages outreach_messages_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_messages
    ADD CONSTRAINT outreach_messages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: outreach_send_counts outreach_send_counts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_send_counts
    ADD CONSTRAINT outreach_send_counts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: outreach_send_limits outreach_send_limits_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_send_limits
    ADD CONSTRAINT outreach_send_limits_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: outreach_sequences outreach_sequences_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_sequences
    ADD CONSTRAINT outreach_sequences_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: outreach_sequences outreach_sequences_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_sequences
    ADD CONSTRAINT outreach_sequences_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: outreach_steps outreach_steps_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_steps
    ADD CONSTRAINT outreach_steps_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.outreach_sequences(id) ON DELETE CASCADE;


--
-- Name: outreach_steps outreach_steps_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_steps
    ADD CONSTRAINT outreach_steps_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: picklist_categories picklist_categories_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picklist_categories
    ADD CONSTRAINT picklist_categories_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: picklist_values picklist_values_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picklist_values
    ADD CONSTRAINT picklist_values_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.picklist_categories(id) ON DELETE CASCADE;


--
-- Name: promotion_redemptions promotion_redemptions_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_redemptions
    ADD CONSTRAINT promotion_redemptions_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id);


--
-- Name: promotion_redemptions promotion_redemptions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_redemptions
    ADD CONSTRAINT promotion_redemptions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: segment_members segment_members_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segment_members
    ADD CONSTRAINT segment_members_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: segment_members segment_members_segment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segment_members
    ADD CONSTRAINT segment_members_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.segments(id) ON DELETE CASCADE;


--
-- Name: segment_members segment_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segment_members
    ADD CONSTRAINT segment_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: segment_rules segment_rules_segment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segment_rules
    ADD CONSTRAINT segment_rules_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.segments(id) ON DELETE CASCADE;


--
-- Name: segment_rules segment_rules_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segment_rules
    ADD CONSTRAINT segment_rules_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: segment_shares segment_shares_segment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segment_shares
    ADD CONSTRAINT segment_shares_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.segments(id) ON DELETE CASCADE;


--
-- Name: segment_versions segment_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segment_versions
    ADD CONSTRAINT segment_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: segment_versions segment_versions_segment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segment_versions
    ADD CONSTRAINT segment_versions_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.segments(id) ON DELETE CASCADE;


--
-- Name: segments segments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segments
    ADD CONSTRAINT segments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: segments segments_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segments
    ADD CONSTRAINT segments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: sequence_steps sequence_steps_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_steps
    ADD CONSTRAINT sequence_steps_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.sequences(id) ON DELETE CASCADE;


--
-- Name: sequence_steps sequence_steps_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_steps
    ADD CONSTRAINT sequence_steps_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.email_templates(id) ON DELETE SET NULL;


--
-- Name: sequence_steps sequence_steps_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_steps
    ADD CONSTRAINT sequence_steps_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: sequences sequences_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequences
    ADD CONSTRAINT sequences_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: sequences sequences_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequences
    ADD CONSTRAINT sequences_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: subscriptions subscriptions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: user_permissions user_permissions_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.menus(menu_id);


--
-- Name: user_permissions user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: users users_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(role_id);


--
-- Name: users users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: users users_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: webhook_logs webhook_logs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: workflow_executions workflow_executions_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: workflow_executions workflow_executions_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;


--
-- Name: workflow_executions workflow_executions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workflows workflows_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: workflows workflows_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(role_id);


--
-- Name: workspace_members workspace_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspaces workspaces_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: zoom_accounts zoom_accounts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zoom_accounts
    ADD CONSTRAINT zoom_accounts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: users Admin can insert users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can insert users" ON public.users FOR INSERT WITH CHECK (((public.get_current_user_role_id() = 1) OR (auth.uid() = user_id)));


--
-- Name: leads Anon can capture leads to default workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anon can capture leads to default workspace" ON public.leads FOR INSERT TO anon WITH CHECK ((((source)::text = ANY ((ARRAY['Website Form'::character varying, 'Public Capture Form'::character varying, 'Embed Form'::character varying])::text[])) AND ((status)::text = 'New'::text)));


--
-- Name: workspaces Anon can read workspace by slug; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anon can read workspace by slug" ON public.workspaces FOR SELECT TO anon USING (true);


--
-- Name: workspaces Authenticated insert workspaces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated insert workspaces" ON public.workspaces FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: segment_versions Authenticated users insert segment versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users insert segment versions" ON public.segment_versions FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: segment_shares Authenticated users modify segment shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users modify segment shares" ON public.segment_shares TO authenticated USING (true);


--
-- Name: segment_shares Authenticated users read segment shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users read segment shares" ON public.segment_shares FOR SELECT TO authenticated USING (true);


--
-- Name: segment_versions Authenticated users read segment versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users read segment versions" ON public.segment_versions FOR SELECT TO authenticated USING (true);


--
-- Name: notifications Delete own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Delete own notifications" ON public.notifications FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: workspaces Owner updates workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner updates workspace" ON public.workspaces FOR UPDATE TO authenticated USING ((owner_id = auth.uid()));


--
-- Name: workspaces Read own workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read own workspace" ON public.workspaces FOR SELECT TO authenticated USING (((id = public.get_current_workspace_id()) OR (EXISTS ( SELECT 1
   FROM public.workspace_members wm
  WHERE ((wm.workspace_id = workspaces.id) AND (wm.user_id = auth.uid()) AND ((wm.status)::text = 'ACTIVE'::text))))));


--
-- Name: account_calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: account_document_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_document_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: account_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: account_note_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_note_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: account_note_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_note_files ENABLE ROW LEVEL SECURITY;

--
-- Name: account_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: account_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log admin_select_audit_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_select_audit_log ON public.audit_log FOR SELECT TO authenticated USING (((public.get_current_user_role_id() = 1) AND (workspace_id = public.get_current_workspace_id())));


--
-- Name: lead_import_archive admin_select_lead_import_archive; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_select_lead_import_archive ON public.lead_import_archive FOR SELECT TO authenticated USING (((public.get_current_user_role_id() = 1) AND (workspace_id = public.get_current_workspace_id())));


--
-- Name: ai_column_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_column_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_column_saved_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_column_saved_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_prompt_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_prompt_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_provider_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_provider_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_segment_prompt_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_segment_prompt_history ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_dashboard_widgets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.analytics_dashboard_widgets ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_dashboards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.analytics_dashboards ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.analytics_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.analytics_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_saved_filters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.analytics_saved_filters ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_chats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_chats ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_trials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_trials ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_trials billing_trials_workspace_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_trials_workspace_read ON public.billing_trials FOR SELECT USING ((workspace_id IN ( SELECT users.workspace_id
   FROM public.users
  WHERE (users.user_id = auth.uid()))));


--
-- Name: blocklist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blocklist ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_approval_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_approval_log ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_template_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_template_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: chargebee_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chargebee_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_document_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_document_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_note_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_note_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_note_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_note_files ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_balances credit_balances_workspace_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY credit_balances_workspace_read ON public.credit_balances FOR SELECT USING ((workspace_id IN ( SELECT users.workspace_id
   FROM public.users
  WHERE (users.user_id = auth.uid()))));


--
-- Name: credit_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_ledger credit_ledger_workspace_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY credit_ledger_workspace_read ON public.credit_ledger FOR SELECT USING ((workspace_id IN ( SELECT users.workspace_id
   FROM public.users
  WHERE (users.user_id = auth.uid()))));


--
-- Name: custom_field_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: demo_bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.demo_bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: demo_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: email_verification_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: feature_kill_switches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feature_kill_switches ENABLE ROW LEVEL SECURITY;

--
-- Name: icp_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.icp_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: icp_profiles icp_profiles_workspace_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY icp_profiles_workspace_all ON public.icp_profiles USING ((workspace_id IN ( SELECT users.workspace_id
   FROM public.users
  WHERE (users.user_id = auth.uid())))) WITH CHECK ((workspace_id IN ( SELECT users.workspace_id
   FROM public.users
  WHERE (users.user_id = auth.uid()))));


--
-- Name: import_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: import_batches import_batches_workspace_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY import_batches_workspace_all ON public.import_batches USING ((workspace_id IN ( SELECT users.workspace_id
   FROM public.users
  WHERE (users.user_id = auth.uid())))) WITH CHECK ((workspace_id IN ( SELECT users.workspace_id
   FROM public.users
  WHERE (users.user_id = auth.uid()))));


--
-- Name: inbox_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_import_archive; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_import_archive ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_operations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_operations ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_operations lead_operations_workspace_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_operations_workspace_read ON public.lead_operations FOR SELECT USING ((workspace_id IN ( SELECT users.workspace_id
   FROM public.users
  WHERE (users.user_id = auth.uid()))));


--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: meetings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletter_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newsletter_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newsletters ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: operation_costs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operation_costs ENABLE ROW LEVEL SECURITY;

--
-- Name: operation_costs operation_costs_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY operation_costs_public_read ON public.operation_costs FOR SELECT USING (true);


--
-- Name: opportunities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_messages outreach_messages_workspace_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY outreach_messages_workspace_all ON public.outreach_messages USING ((workspace_id IN ( SELECT users.workspace_id
   FROM public.users
  WHERE (users.user_id = auth.uid())))) WITH CHECK ((workspace_id IN ( SELECT users.workspace_id
   FROM public.users
  WHERE (users.user_id = auth.uid()))));


--
-- Name: outreach_send_counts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_send_counts ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_send_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_send_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_chats own_delete_assistant_chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY own_delete_assistant_chats ON public.assistant_chats FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: assistant_chats own_insert_assistant_chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY own_insert_assistant_chats ON public.assistant_chats FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: assistant_chats own_select_assistant_chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY own_select_assistant_chats ON public.assistant_chats FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: assistant_chats own_update_assistant_chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY own_update_assistant_chats ON public.assistant_chats FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: picklist_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.picklist_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: picklist_values; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.picklist_values ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_plans plans_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plans_public_read ON public.subscription_plans FOR SELECT USING (true);


--
-- Name: platform_vendor_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_vendor_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: processed_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: promotion_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: promotion_redemptions promotion_redemptions_workspace_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotion_redemptions_workspace_read ON public.promotion_redemptions FOR SELECT USING ((workspace_id IN ( SELECT users.workspace_id
   FROM public.users
  WHERE (users.user_id = auth.uid()))));


--
-- Name: promotions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

--
-- Name: promotions promotions_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotions_public_read ON public.promotions FOR SELECT USING (true);


--
-- Name: segment_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.segment_members ENABLE ROW LEVEL SECURITY;

--
-- Name: segment_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.segment_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: segment_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.segment_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: segment_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.segment_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: segments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

--
-- Name: sequence_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions subscriptions_workspace_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscriptions_workspace_read ON public.subscriptions FOR SELECT USING ((workspace_id IN ( SELECT users.workspace_id
   FROM public.users
  WHERE (users.user_id = auth.uid()))));


--
-- Name: user_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: workflows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

--
-- Name: account_calls ws_delete_account_calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_account_calls ON public.account_calls FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_document_recipients ws_delete_account_document_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_account_document_recipients ON public.account_document_recipients FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.account_documents d
  WHERE ((d.id = account_document_recipients.document_id) AND (d.workspace_id = public.get_current_workspace_id())))));


--
-- Name: account_documents ws_delete_account_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_account_documents ON public.account_documents FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_note_comments ws_delete_account_note_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_account_note_comments ON public.account_note_comments FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_note_files ws_delete_account_note_files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_account_note_files ON public.account_note_files FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.account_notes n
  WHERE ((n.id = account_note_files.note_id) AND (n.workspace_id = public.get_current_workspace_id())))));


--
-- Name: account_notes ws_delete_account_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_account_notes ON public.account_notes FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_tasks ws_delete_account_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_account_tasks ON public.account_tasks FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: accounts ws_delete_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_accounts ON public.accounts FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: ai_column_definitions ws_delete_ai_column_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_ai_column_definitions ON public.ai_column_definitions FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: ai_column_saved_templates ws_delete_ai_column_saved_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_ai_column_saved_templates ON public.ai_column_saved_templates FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: ai_prompt_templates ws_delete_ai_prompt_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_ai_prompt_templates ON public.ai_prompt_templates FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: ai_segment_prompt_history ws_delete_ai_segment_prompt_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_ai_segment_prompt_history ON public.ai_segment_prompt_history FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: analytics_dashboard_widgets ws_delete_analytics_dashboard_widgets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_analytics_dashboard_widgets ON public.analytics_dashboard_widgets FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_dashboards ws_delete_analytics_dashboards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_analytics_dashboards ON public.analytics_dashboards FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_folders ws_delete_analytics_folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_analytics_folders ON public.analytics_folders FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_reports ws_delete_analytics_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_analytics_reports ON public.analytics_reports FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_saved_filters ws_delete_analytics_saved_filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_analytics_saved_filters ON public.analytics_saved_filters FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: blocklist ws_delete_blocklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_blocklist ON public.blocklist FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: calendar_accounts ws_delete_calendar_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_calendar_accounts ON public.calendar_accounts FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_enrollments ws_delete_campaign_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_campaign_enrollments ON public.campaign_enrollments FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_jobs ws_delete_campaign_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_campaign_jobs ON public.campaign_jobs FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_template_steps ws_delete_campaign_template_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_campaign_template_steps ON public.campaign_template_steps FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_templates ws_delete_campaign_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_campaign_templates ON public.campaign_templates FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaigns ws_delete_campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_campaigns ON public.campaigns FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_calls ws_delete_contact_calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_contact_calls ON public.contact_calls FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_document_recipients ws_delete_contact_document_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_contact_document_recipients ON public.contact_document_recipients FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.contact_documents d
  WHERE ((d.id = contact_document_recipients.document_id) AND (d.workspace_id = public.get_current_workspace_id())))));


--
-- Name: contact_documents ws_delete_contact_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_contact_documents ON public.contact_documents FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_note_comments ws_delete_contact_note_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_contact_note_comments ON public.contact_note_comments FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_note_files ws_delete_contact_note_files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_contact_note_files ON public.contact_note_files FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.contact_notes n
  WHERE ((n.id = contact_note_files.note_id) AND (n.workspace_id = public.get_current_workspace_id())))));


--
-- Name: contact_notes ws_delete_contact_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_contact_notes ON public.contact_notes FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_tasks ws_delete_contact_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_contact_tasks ON public.contact_tasks FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contacts ws_delete_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_contacts ON public.contacts FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: custom_field_definitions ws_delete_custom_field_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_custom_field_definitions ON public.custom_field_definitions FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: email_templates ws_delete_email_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_email_templates ON public.email_templates FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: inbox_messages ws_delete_inbox_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_inbox_messages ON public.inbox_messages FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: lead_activities ws_delete_lead_activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_lead_activities ON public.lead_activities FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: lead_notes ws_delete_lead_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_lead_notes ON public.lead_notes FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: leads ws_delete_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_leads ON public.leads FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: meetings ws_delete_meetings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_meetings ON public.meetings FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: newsletter_recipients ws_delete_newsletter_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_newsletter_recipients ON public.newsletter_recipients FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: newsletters ws_delete_newsletters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_newsletters ON public.newsletters FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: notifications ws_delete_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_notifications ON public.notifications FOR DELETE TO authenticated USING (((user_id = auth.uid()) AND (workspace_id = public.get_current_workspace_id())));


--
-- Name: opportunities ws_delete_opportunities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_opportunities ON public.opportunities FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_accounts ws_delete_outreach_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_outreach_accounts ON public.outreach_accounts FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_activities ws_delete_outreach_activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_outreach_activities ON public.outreach_activities FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_enrollments ws_delete_outreach_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_outreach_enrollments ON public.outreach_enrollments FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_jobs ws_delete_outreach_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_outreach_jobs ON public.outreach_jobs FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_send_limits ws_delete_outreach_send_limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_outreach_send_limits ON public.outreach_send_limits FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_sequences ws_delete_outreach_sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_outreach_sequences ON public.outreach_sequences FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_steps ws_delete_outreach_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_outreach_steps ON public.outreach_steps FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: picklist_categories ws_delete_picklist_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_picklist_categories ON public.picklist_categories FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: picklist_values ws_delete_picklist_values; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_picklist_values ON public.picklist_values FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.picklist_categories pc
  WHERE ((pc.id = picklist_values.category_id) AND (pc.workspace_id = public.get_current_workspace_id())))));


--
-- Name: segment_members ws_delete_segment_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_segment_members ON public.segment_members FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: segment_rules ws_delete_segment_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_segment_rules ON public.segment_rules FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: segments ws_delete_segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_segments ON public.segments FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: sequence_steps ws_delete_sequence_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_sequence_steps ON public.sequence_steps FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: sequences ws_delete_sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_sequences ON public.sequences FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: user_permissions ws_delete_user_permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_user_permissions ON public.user_permissions FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: users ws_delete_users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_users ON public.users FOR DELETE USING (((workspace_id = public.get_current_workspace_id()) AND (public.get_current_user_role_id() = 1)));


--
-- Name: workflow_executions ws_delete_workflow_executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_workflow_executions ON public.workflow_executions FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: workflows ws_delete_workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_workflows ON public.workflows FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: zoom_accounts ws_delete_zoom_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_delete_zoom_accounts ON public.zoom_accounts FOR DELETE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_calls ws_insert_account_calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_account_calls ON public.account_calls FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_document_recipients ws_insert_account_document_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_account_document_recipients ON public.account_document_recipients FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.account_documents d
  WHERE ((d.id = account_document_recipients.document_id) AND (d.workspace_id = public.get_current_workspace_id())))));


--
-- Name: account_documents ws_insert_account_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_account_documents ON public.account_documents FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_note_comments ws_insert_account_note_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_account_note_comments ON public.account_note_comments FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_note_files ws_insert_account_note_files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_account_note_files ON public.account_note_files FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.account_notes n
  WHERE ((n.id = account_note_files.note_id) AND (n.workspace_id = public.get_current_workspace_id())))));


--
-- Name: account_notes ws_insert_account_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_account_notes ON public.account_notes FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_tasks ws_insert_account_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_account_tasks ON public.account_tasks FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: accounts ws_insert_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_accounts ON public.accounts FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: ai_column_definitions ws_insert_ai_column_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_ai_column_definitions ON public.ai_column_definitions FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: ai_column_saved_templates ws_insert_ai_column_saved_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_ai_column_saved_templates ON public.ai_column_saved_templates FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: ai_prompt_templates ws_insert_ai_prompt_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_ai_prompt_templates ON public.ai_prompt_templates FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: ai_segment_prompt_history ws_insert_ai_segment_prompt_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_ai_segment_prompt_history ON public.ai_segment_prompt_history FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: analytics_dashboard_widgets ws_insert_analytics_dashboard_widgets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_analytics_dashboard_widgets ON public.analytics_dashboard_widgets FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_dashboards ws_insert_analytics_dashboards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_analytics_dashboards ON public.analytics_dashboards FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_folders ws_insert_analytics_folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_analytics_folders ON public.analytics_folders FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_reports ws_insert_analytics_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_analytics_reports ON public.analytics_reports FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_saved_filters ws_insert_analytics_saved_filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_analytics_saved_filters ON public.analytics_saved_filters FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: audit_log ws_insert_audit_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_audit_log ON public.audit_log FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: blocklist ws_insert_blocklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_blocklist ON public.blocklist FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: calendar_accounts ws_insert_calendar_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_calendar_accounts ON public.calendar_accounts FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_approval_log ws_insert_campaign_approval_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_campaign_approval_log ON public.campaign_approval_log FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_enrollments ws_insert_campaign_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_campaign_enrollments ON public.campaign_enrollments FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_jobs ws_insert_campaign_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_campaign_jobs ON public.campaign_jobs FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_template_steps ws_insert_campaign_template_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_campaign_template_steps ON public.campaign_template_steps FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_templates ws_insert_campaign_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_campaign_templates ON public.campaign_templates FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaigns ws_insert_campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_campaigns ON public.campaigns FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_calls ws_insert_contact_calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_contact_calls ON public.contact_calls FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_document_recipients ws_insert_contact_document_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_contact_document_recipients ON public.contact_document_recipients FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.contact_documents d
  WHERE ((d.id = contact_document_recipients.document_id) AND (d.workspace_id = public.get_current_workspace_id())))));


--
-- Name: contact_documents ws_insert_contact_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_contact_documents ON public.contact_documents FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_note_comments ws_insert_contact_note_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_contact_note_comments ON public.contact_note_comments FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_note_files ws_insert_contact_note_files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_contact_note_files ON public.contact_note_files FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.contact_notes n
  WHERE ((n.id = contact_note_files.note_id) AND (n.workspace_id = public.get_current_workspace_id())))));


--
-- Name: contact_notes ws_insert_contact_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_contact_notes ON public.contact_notes FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_tasks ws_insert_contact_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_contact_tasks ON public.contact_tasks FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contacts ws_insert_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_contacts ON public.contacts FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: custom_field_definitions ws_insert_custom_field_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_custom_field_definitions ON public.custom_field_definitions FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: email_templates ws_insert_email_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_email_templates ON public.email_templates FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: inbox_messages ws_insert_inbox_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_inbox_messages ON public.inbox_messages FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: lead_activities ws_insert_lead_activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_lead_activities ON public.lead_activities FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: lead_import_archive ws_insert_lead_import_archive; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_lead_import_archive ON public.lead_import_archive FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: lead_notes ws_insert_lead_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_lead_notes ON public.lead_notes FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: leads ws_insert_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_leads ON public.leads FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: meetings ws_insert_meetings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_meetings ON public.meetings FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: newsletter_recipients ws_insert_newsletter_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_newsletter_recipients ON public.newsletter_recipients FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: newsletters ws_insert_newsletters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_newsletters ON public.newsletters FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: notifications ws_insert_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_notifications ON public.notifications FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: opportunities ws_insert_opportunities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_opportunities ON public.opportunities FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_accounts ws_insert_outreach_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_outreach_accounts ON public.outreach_accounts FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_activities ws_insert_outreach_activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_outreach_activities ON public.outreach_activities FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_enrollments ws_insert_outreach_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_outreach_enrollments ON public.outreach_enrollments FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_jobs ws_insert_outreach_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_outreach_jobs ON public.outreach_jobs FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_send_limits ws_insert_outreach_send_limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_outreach_send_limits ON public.outreach_send_limits FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_sequences ws_insert_outreach_sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_outreach_sequences ON public.outreach_sequences FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_steps ws_insert_outreach_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_outreach_steps ON public.outreach_steps FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: picklist_categories ws_insert_picklist_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_picklist_categories ON public.picklist_categories FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: picklist_values ws_insert_picklist_values; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_picklist_values ON public.picklist_values FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.picklist_categories pc
  WHERE ((pc.id = picklist_values.category_id) AND (pc.workspace_id = public.get_current_workspace_id())))));


--
-- Name: segment_members ws_insert_segment_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_segment_members ON public.segment_members FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: segment_rules ws_insert_segment_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_segment_rules ON public.segment_rules FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: segments ws_insert_segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_segments ON public.segments FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: sequence_steps ws_insert_sequence_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_sequence_steps ON public.sequence_steps FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: sequences ws_insert_sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_sequences ON public.sequences FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: user_permissions ws_insert_user_permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_user_permissions ON public.user_permissions FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: workflow_executions ws_insert_workflow_executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_workflow_executions ON public.workflow_executions FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: workflows ws_insert_workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_workflows ON public.workflows FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: zoom_accounts ws_insert_zoom_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_insert_zoom_accounts ON public.zoom_accounts FOR INSERT TO authenticated WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_calls ws_select_account_calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_account_calls ON public.account_calls FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_document_recipients ws_select_account_document_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_account_document_recipients ON public.account_document_recipients FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.account_documents d
  WHERE ((d.id = account_document_recipients.document_id) AND (d.workspace_id = public.get_current_workspace_id())))));


--
-- Name: account_documents ws_select_account_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_account_documents ON public.account_documents FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_note_comments ws_select_account_note_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_account_note_comments ON public.account_note_comments FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_note_files ws_select_account_note_files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_account_note_files ON public.account_note_files FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.account_notes n
  WHERE ((n.id = account_note_files.note_id) AND (n.workspace_id = public.get_current_workspace_id())))));


--
-- Name: account_notes ws_select_account_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_account_notes ON public.account_notes FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_tasks ws_select_account_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_account_tasks ON public.account_tasks FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: accounts ws_select_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_accounts ON public.accounts FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: ai_column_definitions ws_select_ai_column_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_ai_column_definitions ON public.ai_column_definitions FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: ai_column_saved_templates ws_select_ai_column_saved_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_ai_column_saved_templates ON public.ai_column_saved_templates FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: ai_prompt_templates ws_select_ai_prompt_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_ai_prompt_templates ON public.ai_prompt_templates FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: ai_segment_prompt_history ws_select_ai_segment_prompt_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_ai_segment_prompt_history ON public.ai_segment_prompt_history FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: analytics_dashboard_widgets ws_select_analytics_dashboard_widgets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_analytics_dashboard_widgets ON public.analytics_dashboard_widgets FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_dashboards ws_select_analytics_dashboards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_analytics_dashboards ON public.analytics_dashboards FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_folders ws_select_analytics_folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_analytics_folders ON public.analytics_folders FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_reports ws_select_analytics_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_analytics_reports ON public.analytics_reports FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_saved_filters ws_select_analytics_saved_filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_analytics_saved_filters ON public.analytics_saved_filters FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: blocklist ws_select_blocklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_blocklist ON public.blocklist FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: calendar_accounts ws_select_calendar_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_calendar_accounts ON public.calendar_accounts FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_approval_log ws_select_campaign_approval_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_campaign_approval_log ON public.campaign_approval_log FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_enrollments ws_select_campaign_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_campaign_enrollments ON public.campaign_enrollments FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_jobs ws_select_campaign_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_campaign_jobs ON public.campaign_jobs FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_template_steps ws_select_campaign_template_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_campaign_template_steps ON public.campaign_template_steps FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_templates ws_select_campaign_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_campaign_templates ON public.campaign_templates FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaigns ws_select_campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_campaigns ON public.campaigns FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_calls ws_select_contact_calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_contact_calls ON public.contact_calls FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_document_recipients ws_select_contact_document_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_contact_document_recipients ON public.contact_document_recipients FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.contact_documents d
  WHERE ((d.id = contact_document_recipients.document_id) AND (d.workspace_id = public.get_current_workspace_id())))));


--
-- Name: contact_documents ws_select_contact_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_contact_documents ON public.contact_documents FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_note_comments ws_select_contact_note_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_contact_note_comments ON public.contact_note_comments FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_note_files ws_select_contact_note_files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_contact_note_files ON public.contact_note_files FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.contact_notes n
  WHERE ((n.id = contact_note_files.note_id) AND (n.workspace_id = public.get_current_workspace_id())))));


--
-- Name: contact_notes ws_select_contact_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_contact_notes ON public.contact_notes FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_tasks ws_select_contact_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_contact_tasks ON public.contact_tasks FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contacts ws_select_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_contacts ON public.contacts FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: custom_field_definitions ws_select_custom_field_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_custom_field_definitions ON public.custom_field_definitions FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: email_templates ws_select_email_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_email_templates ON public.email_templates FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: inbox_messages ws_select_inbox_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_inbox_messages ON public.inbox_messages FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: lead_activities ws_select_lead_activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_lead_activities ON public.lead_activities FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: lead_notes ws_select_lead_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_lead_notes ON public.lead_notes FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: leads ws_select_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_leads ON public.leads FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: meetings ws_select_meetings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_meetings ON public.meetings FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: newsletter_recipients ws_select_newsletter_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_newsletter_recipients ON public.newsletter_recipients FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: newsletters ws_select_newsletters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_newsletters ON public.newsletters FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: notifications ws_select_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_notifications ON public.notifications FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (workspace_id = public.get_current_workspace_id())));


--
-- Name: opportunities ws_select_opportunities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_opportunities ON public.opportunities FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_accounts ws_select_outreach_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_outreach_accounts ON public.outreach_accounts FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_activities ws_select_outreach_activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_outreach_activities ON public.outreach_activities FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_enrollments ws_select_outreach_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_outreach_enrollments ON public.outreach_enrollments FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_jobs ws_select_outreach_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_outreach_jobs ON public.outreach_jobs FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_send_limits ws_select_outreach_send_limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_outreach_send_limits ON public.outreach_send_limits FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_sequences ws_select_outreach_sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_outreach_sequences ON public.outreach_sequences FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_steps ws_select_outreach_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_outreach_steps ON public.outreach_steps FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: picklist_categories ws_select_picklist_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_picklist_categories ON public.picklist_categories FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: picklist_values ws_select_picklist_values; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_picklist_values ON public.picklist_values FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.picklist_categories pc
  WHERE ((pc.id = picklist_values.category_id) AND (pc.workspace_id = public.get_current_workspace_id())))));


--
-- Name: segment_members ws_select_segment_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_segment_members ON public.segment_members FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: segment_rules ws_select_segment_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_segment_rules ON public.segment_rules FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: segments ws_select_segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_segments ON public.segments FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: sequence_steps ws_select_sequence_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_sequence_steps ON public.sequence_steps FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: sequences ws_select_sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_sequences ON public.sequences FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: user_permissions ws_select_user_permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_user_permissions ON public.user_permissions FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: users ws_select_users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_users ON public.users FOR SELECT USING (((user_id = auth.uid()) OR (workspace_id = public.get_current_workspace_id()) OR (EXISTS ( SELECT 1
   FROM public.workspace_members wm
  WHERE ((wm.user_id = users.user_id) AND (wm.workspace_id = public.get_current_workspace_id()) AND ((wm.status)::text = 'ACTIVE'::text))))));


--
-- Name: workflow_executions ws_select_workflow_executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_workflow_executions ON public.workflow_executions FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: workflows ws_select_workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_workflows ON public.workflows FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: workspace_members ws_select_workspace_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_workspace_members ON public.workspace_members FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (workspace_id = public.get_current_workspace_id())));


--
-- Name: zoom_accounts ws_select_zoom_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_select_zoom_accounts ON public.zoom_accounts FOR SELECT TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_calls ws_update_account_calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_account_calls ON public.account_calls FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_document_recipients ws_update_account_document_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_account_document_recipients ON public.account_document_recipients FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.account_documents d
  WHERE ((d.id = account_document_recipients.document_id) AND (d.workspace_id = public.get_current_workspace_id())))));


--
-- Name: account_documents ws_update_account_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_account_documents ON public.account_documents FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: account_tasks ws_update_account_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_account_tasks ON public.account_tasks FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: accounts ws_update_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_accounts ON public.accounts FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: ai_column_definitions ws_update_ai_column_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_ai_column_definitions ON public.ai_column_definitions FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: ai_prompt_templates ws_update_ai_prompt_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_ai_prompt_templates ON public.ai_prompt_templates FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_dashboard_widgets ws_update_analytics_dashboard_widgets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_analytics_dashboard_widgets ON public.analytics_dashboard_widgets FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_dashboards ws_update_analytics_dashboards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_analytics_dashboards ON public.analytics_dashboards FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_folders ws_update_analytics_folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_analytics_folders ON public.analytics_folders FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_reports ws_update_analytics_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_analytics_reports ON public.analytics_reports FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: analytics_saved_filters ws_update_analytics_saved_filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_analytics_saved_filters ON public.analytics_saved_filters FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: blocklist ws_update_blocklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_blocklist ON public.blocklist FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: calendar_accounts ws_update_calendar_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_calendar_accounts ON public.calendar_accounts FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_enrollments ws_update_campaign_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_campaign_enrollments ON public.campaign_enrollments FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_jobs ws_update_campaign_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_campaign_jobs ON public.campaign_jobs FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_template_steps ws_update_campaign_template_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_campaign_template_steps ON public.campaign_template_steps FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaign_templates ws_update_campaign_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_campaign_templates ON public.campaign_templates FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: campaigns ws_update_campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_campaigns ON public.campaigns FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_calls ws_update_contact_calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_contact_calls ON public.contact_calls FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_document_recipients ws_update_contact_document_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_contact_document_recipients ON public.contact_document_recipients FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.contact_documents d
  WHERE ((d.id = contact_document_recipients.document_id) AND (d.workspace_id = public.get_current_workspace_id())))));


--
-- Name: contact_documents ws_update_contact_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_contact_documents ON public.contact_documents FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contact_tasks ws_update_contact_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_contact_tasks ON public.contact_tasks FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: contacts ws_update_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_contacts ON public.contacts FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: custom_field_definitions ws_update_custom_field_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_custom_field_definitions ON public.custom_field_definitions FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: email_templates ws_update_email_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_email_templates ON public.email_templates FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: inbox_messages ws_update_inbox_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_inbox_messages ON public.inbox_messages FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: lead_activities ws_update_lead_activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_lead_activities ON public.lead_activities FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: lead_import_archive ws_update_lead_import_archive; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_lead_import_archive ON public.lead_import_archive FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id())) WITH CHECK ((workspace_id = public.get_current_workspace_id()));


--
-- Name: leads ws_update_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_leads ON public.leads FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: meetings ws_update_meetings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_meetings ON public.meetings FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: newsletter_recipients ws_update_newsletter_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_newsletter_recipients ON public.newsletter_recipients FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: newsletters ws_update_newsletters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_newsletters ON public.newsletters FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: notifications ws_update_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_notifications ON public.notifications FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (workspace_id = public.get_current_workspace_id())));


--
-- Name: opportunities ws_update_opportunities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_opportunities ON public.opportunities FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_accounts ws_update_outreach_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_outreach_accounts ON public.outreach_accounts FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_activities ws_update_outreach_activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_outreach_activities ON public.outreach_activities FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_enrollments ws_update_outreach_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_outreach_enrollments ON public.outreach_enrollments FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_jobs ws_update_outreach_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_outreach_jobs ON public.outreach_jobs FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_send_limits ws_update_outreach_send_limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_outreach_send_limits ON public.outreach_send_limits FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_sequences ws_update_outreach_sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_outreach_sequences ON public.outreach_sequences FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: outreach_steps ws_update_outreach_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_outreach_steps ON public.outreach_steps FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: picklist_categories ws_update_picklist_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_picklist_categories ON public.picklist_categories FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: picklist_values ws_update_picklist_values; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_picklist_values ON public.picklist_values FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.picklist_categories pc
  WHERE ((pc.id = picklist_values.category_id) AND (pc.workspace_id = public.get_current_workspace_id())))));


--
-- Name: segment_members ws_update_segment_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_segment_members ON public.segment_members FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: segment_rules ws_update_segment_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_segment_rules ON public.segment_rules FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: segments ws_update_segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_segments ON public.segments FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: sequence_steps ws_update_sequence_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_sequence_steps ON public.sequence_steps FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: sequences ws_update_sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_sequences ON public.sequences FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: user_permissions ws_update_user_permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_user_permissions ON public.user_permissions FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: users ws_update_users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_users ON public.users FOR UPDATE USING (((user_id = auth.uid()) OR ((workspace_id = public.get_current_workspace_id()) AND (public.get_current_user_role_id() = 1))));


--
-- Name: workflow_executions ws_update_workflow_executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_workflow_executions ON public.workflow_executions FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: workflows ws_update_workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_workflows ON public.workflows FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: zoom_accounts ws_update_zoom_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_update_zoom_accounts ON public.zoom_accounts FOR UPDATE TO authenticated USING ((workspace_id = public.get_current_workspace_id()));


--
-- Name: zoom_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zoom_accounts ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


