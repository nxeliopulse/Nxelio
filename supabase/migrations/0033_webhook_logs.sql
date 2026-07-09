-- ============================================================================
-- 0033 — Webhook event log (audit + idempotency for Chargebee)
-- Every inbound event is logged by event_id BEFORE processing; duplicates are
-- skipped. Not tenant-facing: RLS enabled with NO policies => only the service
-- role (which bypasses RLS) can read/write.
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT NOT NULL DEFAULT 'chargebee',
  event_id     TEXT UNIQUE,                 -- Chargebee event.id — dedupe key
  event_type   TEXT,                        -- 'subscription_created', etc.
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  payload      JSONB,
  status       TEXT NOT NULL DEFAULT 'received'
                 CHECK (status IN ('received','processed','failed','skipped')),
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_type ON webhook_logs (event_type, created_at DESC);

-- RLS on, no policies: invisible to all client roles; service role bypasses.
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
