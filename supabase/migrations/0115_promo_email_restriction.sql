-- ============================================================================
-- 0115_promo_email_restriction.sql
--
-- Lets a platform admin generate a one-time promo code restricted to a
-- single email address, with a configurable expiry (reuses the existing
-- `valid_until` column — no new expiry mechanism needed). One-time-use is
-- already covered by the existing `max_redemptions` column (set to 1 for
-- these codes); this migration only adds the email restriction itself.
-- ============================================================================

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS restricted_email TEXT;
CREATE INDEX IF NOT EXISTS idx_promotions_restricted_email ON promotions (restricted_email) WHERE restricted_email IS NOT NULL;

-- redeem_promotion_start: add an optional p_email param (defaulted, so the
-- existing call site keeps working even before the app code is redeployed)
-- and reject redemption if the code is email-restricted and doesn't match.
CREATE OR REPLACE FUNCTION redeem_promotion_start(
  p_workspace_id UUID,
  p_code         TEXT,
  p_plan_id      TEXT,
  p_email        TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
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
