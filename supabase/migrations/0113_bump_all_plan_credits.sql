-- ============================================================================
-- 0113_bump_all_plan_credits.sql
--
-- Raise the monthly AI-credit allowance across all plans per the updated
-- product spec: Basic 200 -> 400, Starter 700 -> 1,400, Pro 1,500 -> 2,400.
-- leads_per_cycle is unchanged (Basic 0, Starter 1,000, Pro 2,000 already
-- match spec). Applied immediately to existing subscriptions, same "apply
-- now" policy used for the prior repricing migrations (0071, 0072).
-- ============================================================================

UPDATE subscription_plans SET credits_per_cycle = 400  WHERE id = 'basic';
UPDATE subscription_plans SET credits_per_cycle = 1400 WHERE id = 'starter';
UPDATE subscription_plans SET credits_per_cycle = 2400 WHERE id = 'pro';

UPDATE subscriptions s
SET credits_total     = sp.credits_per_cycle,
    credits_remaining = sp.credits_per_cycle
FROM subscription_plans sp
WHERE s.plan_id = sp.id;
