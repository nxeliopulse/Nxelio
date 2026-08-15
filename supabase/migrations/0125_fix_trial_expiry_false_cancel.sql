-- ============================================================================
-- deduct_credits() was locally marking a subscription "canceled" whenever
-- it was still "trialing" past trial_ends_at — but a trial ending doesn't
-- mean canceled, it means Stripe just charged the card and converted the
-- subscription to "active" (trial_period_days was set at checkout
-- specifically so this happens). If the webhook confirming that hasn't
-- landed yet (delay, or `stripe listen` not running locally) by the time
-- the user does anything that spends a credit, this function would jump
-- ahead and falsely declare the subscription canceled — locking out an
-- actively-paying customer until the next Stripe event happened to
-- resync it. This exact bug was caught live on one real workspace (fixed
-- via direct resync as a one-off).
--
-- A "spend one credit" RPC has no business writing subscription status at
-- all — that's the webhook's job, since only Stripe knows what actually
-- happened. This version just declines the spend without mutating
-- anything, and leaves reconciliation entirely to the webhook.
-- ============================================================================

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
  SELECT * INTO v_sub
  FROM subscriptions WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No subscription found');
  END IF;

  IF v_sub.status NOT IN ('active','trialing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Subscription not active', 'status', v_sub.status);
  END IF;

  IF v_sub.status = 'trialing'
     AND v_sub.trial_ends_at IS NOT NULL
     AND v_sub.trial_ends_at < now() THEN
    -- Do NOT write status = 'canceled' here — see migration header. The
    -- trial ending almost always means Stripe just converted this to a
    -- real paid subscription; only the webhook knows for sure.
    RETURN jsonb_build_object('ok', false, 'error', 'Trial period has ended — please refresh in a moment while your subscription syncs.');
  END IF;

  IF v_sub.credits_remaining < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient credits',
                              'remaining', v_sub.credits_remaining);
  END IF;

  v_bal := v_sub.credits_remaining - p_amount;

  UPDATE subscriptions
  SET credits_remaining = v_bal, updated_at = now()
  WHERE id = v_sub.id;

  INSERT INTO credit_ledger
    (workspace_id, subscription_id, operation_type, credits_delta,
     lead_id, campaign_id, status, metadata)
  VALUES
    (p_workspace_id, v_sub.id, p_operation_type, -p_amount,
     p_lead_id, p_campaign_id, 'completed', p_metadata);

  RETURN jsonb_build_object('ok', true, 'remaining', v_bal, 'deducted', p_amount);
END;
$$;
