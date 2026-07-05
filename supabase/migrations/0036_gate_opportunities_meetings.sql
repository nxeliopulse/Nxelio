-- ============================================================================
-- Add two new plan features: "opportunities" and "meetings", both Pro-only —
-- per product decision, these pages weren't gated by plan before at all.
-- Merged into the existing features JSONB rather than overwriting it.
-- ============================================================================

UPDATE subscription_plans
SET features = features || '{"opportunities": false, "meetings": false}'::jsonb
WHERE id IN ('basic', 'starter');

UPDATE subscription_plans
SET features = features || '{"opportunities": true, "meetings": true}'::jsonb
WHERE id = 'pro';
