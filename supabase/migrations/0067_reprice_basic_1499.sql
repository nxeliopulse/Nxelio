-- ============================================================
-- 0067_reprice_basic_1499.sql
-- Basic plan: $15.99/mo -> $14.99/mo, $153.50/yr -> $143.90/yr
-- (20% annual discount convention preserved). Credits (200/mo)
-- and Starter/Pro plans are unaffected.
-- ============================================================

UPDATE subscription_plans
SET monthly_price_cents = 1499,
    annual_price_cents  = 14390
WHERE id = 'basic';
