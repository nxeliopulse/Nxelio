-- ============================================================================
-- 0147 — Supports three things for the demo-booking → admin notification →
-- calendar-event feature:
--
-- 1. Zoho as a third calendar provider alongside Google/Microsoft.
-- 2. A "default" flag on the demo-call roster (demo_call_people) — the admin
--    notify email no longer needs to be hardcoded in application code; it's
--    whoever is marked default (or live for the exact slot, which already
--    takes priority — see getLiveRepForSlot).
-- 3. Company name on demo_requests (the booking form's new optional field),
--    plus a record of which calendar the event landed on and its event id
--    (so a re-processed booking can detect "already created" instead of
--    making a second event), and a uniqueness guard against a genuine
--    double-submit of the exact same booking.
-- ============================================================================

ALTER TABLE calendar_accounts DROP CONSTRAINT IF EXISTS calendar_accounts_provider_check;
ALTER TABLE calendar_accounts ADD CONSTRAINT calendar_accounts_provider_check
  CHECK (provider IN ('google', 'microsoft', 'zoho'));

ALTER TABLE demo_call_people ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE demo_requests ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE demo_requests ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;
ALTER TABLE demo_requests ADD COLUMN IF NOT EXISTS calendar_provider TEXT;

-- Guards against the same visitor's browser double-submitting the same
-- booking (e.g. a double-click before the button disables) from ever
-- creating two demo_requests rows / two calendar events / two email blasts.
ALTER TABLE demo_requests DROP CONSTRAINT IF EXISTS demo_requests_email_start_unique;
ALTER TABLE demo_requests ADD CONSTRAINT demo_requests_email_start_unique
  UNIQUE (business_email, meeting_start_at);
