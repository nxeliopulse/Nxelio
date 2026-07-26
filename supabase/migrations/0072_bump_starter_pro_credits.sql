-- ============================================================================
-- 0072_bump_starter_pro_credits.sql
--
-- Raise the monthly AI-credit allowance: Starter 300 -> 700, Pro 1,000 -> 1,500
-- (Basic unchanged, price unchanged). Applied immediately to existing
-- subscriptions, same "apply now" policy used for the leads bump in 0071.
-- ============================================================================

UPDATE subscription_plans SET credits_per_cycle = 700  WHERE id = 'starter';
UPDATE subscription_plans SET credits_per_cycle = 1500 WHERE id = 'pro';

UPDATE subscriptions s
SET credits_total     = sp.credits_per_cycle,
    credits_remaining = sp.credits_per_cycle
FROM subscription_plans sp
WHERE s.plan_id = sp.id AND sp.id IN ('starter', 'pro');
