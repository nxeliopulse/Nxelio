-- Cancellation retention system: tracks customer cancellation requests so the
-- admin team can intervene, schedule a meeting, make a retention offer, and
-- only cancel in Stripe when the customer cannot be retained.

CREATE TABLE cancellation_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  customer_name        TEXT,
  customer_email       TEXT NOT NULL,
  plan_id              TEXT,
  reason               TEXT NOT NULL
                       CHECK (reason IN ('too_expensive','missing_features','found_alternative',
                                         'not_using','technical_issues','business_closed','other')),
  feedback             TEXT,
  wants_meeting        BOOLEAN NOT NULL DEFAULT false,
  meeting_provider     TEXT CHECK (meeting_provider IN ('zoom','google_meet') OR meeting_provider IS NULL),
  preferred_date       DATE,
  preferred_time       TEXT,
  meeting_link         TEXT,
  meeting_scheduled_at TIMESTAMPTZ,
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','meeting_scheduled','retained',
                                         'cancelled','follow_up_required','no_response')),
  admin_notes          TEXT,
  retention_offer      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at          TIMESTAMPTZ
);

ALTER TABLE cancellation_requests ENABLE ROW LEVEL SECURITY;

-- Customers can read and insert their own workspace's tickets
CREATE POLICY "cr_workspace_select" ON cancellation_requests
  FOR SELECT USING (workspace_id = get_current_workspace_id());

CREATE POLICY "cr_workspace_insert" ON cancellation_requests
  FOR INSERT WITH CHECK (workspace_id = get_current_workspace_id());

-- Admin uses createAdminClient() (service_role) which bypasses RLS

CREATE TRIGGER cancellation_requests_updated_at
  BEFORE UPDATE ON cancellation_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
