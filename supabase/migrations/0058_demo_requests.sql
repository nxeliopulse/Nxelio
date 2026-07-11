-- ============================================================================
-- 0058 — Demo requests from the marketing landing page's "Book Demo" popup.
-- Not tenant-facing (no workspace): a prospect books a demo with the Nxelio
-- sales team, not a meeting inside any customer's workspace. RLS enabled with
-- NO policies => only the service role (createAdminClient) can read/write,
-- same pattern as webhook_logs (0033).
-- ============================================================================

CREATE TABLE IF NOT EXISTS demo_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        TEXT NOT NULL,
  business_email   TEXT NOT NULL,
  phone            TEXT NOT NULL,
  industry         TEXT NOT NULL,
  employee_count   TEXT NOT NULL,        -- band, e.g. "1-10"
  monthly_revenue  TEXT NOT NULL,        -- band, e.g. "$10k-$50k"
  purpose          TEXT,
  referral_source  TEXT,                 -- "how did you hear about us"
  requested_date   DATE NOT NULL,
  requested_time   TEXT NOT NULL,        -- "02:30 PM" — pre-formatted, manual AM/PM entry
  meeting_start_at TIMESTAMPTZ NOT NULL, -- requested_date + requested_time combined, for sorting
  join_url         TEXT,
  status           TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','completed','canceled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demo_requests_created ON demo_requests (created_at DESC);

ALTER TABLE demo_requests ENABLE ROW LEVEL SECURITY;
