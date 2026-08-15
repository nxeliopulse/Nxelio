-- ============================================================================
-- reset_subscription_cycle idempotency guard.
--
-- Stripe delivers webhooks with an "at-least-once" guarantee — the same
-- invoice.paid event can be redelivered (network retry, slow response
-- timeout, etc.). The webhook handler calls reset_subscription_cycle() on
-- every invoice.paid for a renewal, and this function had NO protection
-- against being called twice for the same invoice — a redelivered event
-- would grant a second full free credits/leads refill for the same
-- billing cycle. This closes that gap using last_synced_resource_version
-- (an existing column that was already present on the table but never
-- actually wired up anywhere in the app) to remember the last invoice ID
-- a reset was already applied for, and skip if it matches.
-- ============================================================================

CREATE OR REPLACE FUNCTION reset_subscription_cycle(p_workspace_id UUID, p_idempotency_key TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub  subscriptions%ROWTYPE;
  v_plan subscription_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Already applied for this exact invoice — a redelivered webhook, not a
  -- new cycle. No-op rather than granting a second free refill.
  IF p_idempotency_key IS NOT NULL AND v_sub.last_synced_resource_version = p_idempotency_key THEN
    RETURN;
  END IF;

  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_sub.plan_id;

  UPDATE subscriptions SET
    credits_remaining            = v_plan.credits_per_cycle,
    credits_total                = v_plan.credits_per_cycle,
    leads_remaining               = v_plan.leads_per_cycle,
    leads_total                   = v_plan.leads_per_cycle,
    current_period_start         = now(),
    current_period_end           = CASE
                                      WHEN v_sub.billing_interval = 'annual'
                                      THEN now() + INTERVAL '1 year'
                                      ELSE now() + INTERVAL '30 days'
                                    END,
    low_balance_notified_at      = NULL,
    status                        = 'active',
    last_synced_resource_version = COALESCE(p_idempotency_key, v_sub.last_synced_resource_version),
    updated_at                    = now()
  WHERE workspace_id = p_workspace_id;

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.credits_per_cycle, 'credits',
          'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval, 'idempotency_key', p_idempotency_key));

  IF v_plan.leads_per_cycle > 0 THEN
    INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
    VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.leads_per_cycle, 'leads',
            'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval, 'idempotency_key', p_idempotency_key));
  END IF;
END;
$$;
