-- ============================================================================
-- 0135_stripe_event_idempotency.sql
--
-- Stripe explicitly documents that a webhook endpoint may receive the same
-- event more than once (retries after a slow/failed response, or a genuine
-- redelivery) and that handlers must be safe to run twice. Several of the
-- webhook's individual operations already guard against this on their own
-- (reset_subscription_cycle's invoice-id idempotency key from 0126,
-- sync_subscription_from_stripe's plan-change guard, redeem_promotion_finalize's
-- pending→completed status transition) — but that safety was scattered
-- per-operation rather than at the one place that actually knows which
-- Stripe event this is. This adds a single, general event-id ledger so
-- src/app/api/billing/webhook/route.ts can recognize and skip a redelivered
-- event outright, protecting every event type uniformly (including any
-- added later that isn't independently idempotent).
-- ============================================================================

CREATE TABLE IF NOT EXISTS stripe_processed_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stripe_processed_events ENABLE ROW LEVEL SECURITY;

-- Server-only (the webhook route uses the admin/service-role client) — no
-- workspace to scope this to, and nothing client-side ever needs to read it.
REVOKE ALL ON stripe_processed_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON stripe_processed_events TO service_role;
