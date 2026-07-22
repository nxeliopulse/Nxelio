-- ============================================================
-- 0060_reprice_basic.sql
-- Basic plan: $9.99/mo -> $14.99/mo, $95.90/yr -> $143.90/yr
-- (20% annual discount convention preserved). Credits (200/mo)
-- and Starter/Pro plans are unaffected.
-- ============================================================

UPDATE subscription_plans
SET monthly_price_cents = 1499,
    annual_price_cents  = 14390
WHERE id = 'basic';
