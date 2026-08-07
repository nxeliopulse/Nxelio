-- ============================================================================
-- 0091 — Make Opportunities available on every plan, including Basic.
-- Previously: basic.features.opportunities = false (Starter/Pro only).
-- hasFeature("opportunities") reads this JSONB column directly, so flipping
-- it here is the entire fix — no application code change needed.
-- ============================================================================
UPDATE subscription_plans
SET features = jsonb_set(features, '{opportunities}', 'true'::jsonb)
WHERE id = 'basic';
