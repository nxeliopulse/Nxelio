-- ============================================================================
-- Subscription cancellation tracking.
--
-- Neither column existed before, so a subscription scheduled to cancel at
-- period end (Stripe's cancel_at_period_end: true, status stays "active"
-- until the period actually ends) was completely invisible locally — the
-- billing page just showed plain "Active" with no indication anything was
-- scheduled, until Stripe finally fired customer.subscription.deleted.
-- Both nullable/defaulted: existing rows are simply "not scheduled to
-- cancel" until the next sync, no backfill needed.
-- ============================================================================

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
