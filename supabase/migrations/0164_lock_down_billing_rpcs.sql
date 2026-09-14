-- ============================================================================
-- 0162_lock_down_billing_rpcs.sql
--
-- CRITICAL — complete paywall bypass, verified exploitable on the dev project.
--
-- 0126 tried to lock the billing RPCs down with `REVOKE EXECUTE ... FROM
-- PUBLIC`. That is not enough on Supabase: every function created in the
-- public schema also receives an EXPLICIT grant to `anon` and `authenticated`
-- via ALTER DEFAULT PRIVILEGES. Revoking from PUBLIC does not touch those
-- explicit role grants, so the functions stayed callable through PostgREST by
-- anyone holding the anon key — which ships to every browser.
--
-- Proven against the dev project with nothing but the public anon key:
--
--   POST /rest/v1/rpc/sync_subscription_from_stripe
--     {"p_workspace_id":"<any>","p_plan_id":"pro","p_status":"active",
--      "p_credits_total":999999,...}                           -> HTTP 204
--   => workspace upgraded to Pro/active, 999,999 credits and leads,
--      period end 2099, no Stripe subscription, no payment.
--
--   POST /rest/v1/rpc/reset_subscription_cycle
--     {"p_workspace_id":"<any>","p_idempotency_key":null}      -> HTTP 204
--   => unlimited credit/lead refills, period extended, status forced 'active'.
--
--   POST /rest/v1/rpc/deduct_credits
--     {"p_workspace_id":"<any victim>","p_amount":1}           -> {"ok":true}
--   => drains any workspace's credits. The ownership check reads
--      `IF get_current_workspace_id() IS NOT NULL AND ...`, and an anon
--      caller has no JWT, so get_current_workspace_id() is NULL and the
--      check is skipped — the same escape hatch intended for service_role.
--
-- An authenticated user could equally wipe another tenant's paid plan:
-- user A calling sync_subscription_from_stripe with user B's workspace_id
-- downgraded B from Pro/2400 credits to Basic/400.
--
-- Fixes here:
--   1. REVOKE the billing RPCs from anon + authenticated explicitly (not just
--      PUBLIC), granting only service_role where the app's admin client needs
--      them.
--   2. Drop the stale single-argument reset_subscription_cycle(UUID) overload
--      left behind by 0029. It has no idempotency guard at all, and its only
--      current protection is an accidental PostgREST overload ambiguity.
--   3. Make deduct_credits / deduct_leads / redeem_promotion_start reject a
--      caller with no JWT outright instead of treating "no JWT" as "trusted
--      service role". Real service-role calls come through the admin client,
--      which sets the service_role JWT claim, so this keeps them working
--      while closing the anon path.
-- ============================================================================

-- ── 2. Remove the unguarded legacy overload ────────────────────────────────
DROP FUNCTION IF EXISTS reset_subscription_cycle(UUID);

-- ── 3. Treat "no JWT" as untrusted, not as service_role ────────────────────
-- Returns true only for a genuine service-role caller.
CREATE OR REPLACE FUNCTION is_service_role_caller()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    current_user
  ) = 'service_role';
$$;

CREATE OR REPLACE FUNCTION deduct_credits(
  p_workspace_id    UUID,
  p_operation_type  TEXT,
  p_amount          INTEGER DEFAULT 1,
  p_lead_id         UUID    DEFAULT NULL,
  p_campaign_id     UUID    DEFAULT NULL,
  p_metadata        JSONB   DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub  subscriptions%ROWTYPE;
  v_bal  INTEGER;
BEGIN
  -- Only the service role may act on a workspace other than the caller's own,
  -- and an anonymous caller (no JWT at all) may not act on any workspace.
  IF NOT is_service_role_caller()
     AND (get_current_workspace_id() IS NULL OR p_workspace_id <> get_current_workspace_id()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized for this workspace');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid amount');
  END IF;

  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No subscription found');
  END IF;

  IF v_sub.status NOT IN ('active','trialing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Subscription not active', 'status', v_sub.status);
  END IF;

  IF v_sub.status = 'trialing'
     AND v_sub.trial_ends_at IS NOT NULL
     AND v_sub.trial_ends_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trial period has ended — please refresh in a moment while your subscription syncs.');
  END IF;

  IF v_sub.credits_remaining < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient credits', 'remaining', v_sub.credits_remaining);
  END IF;

  v_bal := v_sub.credits_remaining - p_amount;

  UPDATE subscriptions SET credits_remaining = v_bal, updated_at = now() WHERE id = v_sub.id;

  INSERT INTO credit_ledger
    (workspace_id, subscription_id, operation_type, credits_delta, lead_id, campaign_id, status, metadata)
  VALUES
    (p_workspace_id, v_sub.id, p_operation_type, -p_amount, p_lead_id, p_campaign_id, 'completed', p_metadata);

  RETURN jsonb_build_object('ok', true, 'remaining', v_bal, 'deducted', p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION deduct_leads(
  p_workspace_id UUID,
  p_amount       INTEGER DEFAULT 1,
  p_metadata     JSONB   DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
BEGIN
  IF NOT is_service_role_caller()
     AND (get_current_workspace_id() IS NULL OR p_workspace_id <> get_current_workspace_id()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized for this workspace');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid amount');
  END IF;

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

  UPDATE subscriptions SET leads_remaining = leads_remaining - p_amount, updated_at = now() WHERE id = v_sub.id;

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'lead_discovery', -p_amount, 'leads', 'completed', p_metadata);

  RETURN jsonb_build_object('ok', true, 'remaining', v_sub.leads_remaining - p_amount, 'deducted', p_amount);
END;
$$;

-- ── 1. Explicit REVOKEs — the part 0126 missed ─────────────────────────────
-- Server-only RPCs: the webhook, checkout-return and cron all use the
-- service-role admin client, so nothing legitimate calls these from a browser.
REVOKE EXECUTE ON FUNCTION sync_subscription_from_stripe(
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_subscription_from_stripe(
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ
) TO service_role;

REVOKE EXECUTE ON FUNCTION reset_subscription_cycle(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION reset_subscription_cycle(UUID, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION redeem_promotion_finalize(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION redeem_promotion_finalize(UUID, TEXT, TEXT) TO service_role;

-- User-callable, but never anonymously.
REVOKE EXECUTE ON FUNCTION deduct_credits(UUID, TEXT, INTEGER, UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION deduct_credits(UUID, TEXT, INTEGER, UUID, UUID, JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION deduct_leads(UUID, INTEGER, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION deduct_leads(UUID, INTEGER, JSONB) TO authenticated, service_role;

DROP FUNCTION IF EXISTS redeem_promotion_start(UUID, TEXT, TEXT);
REVOKE EXECUTE ON FUNCTION redeem_promotion_start(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION redeem_promotion_start(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
