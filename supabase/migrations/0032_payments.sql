-- ============================================================================
-- 0032 — Payments / invoice history (local mirror of Chargebee invoices)
-- Powers the dashboard's Payment History + Invoices without calling Chargebee
-- on render. Written by the webhook via the service role.
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  chargebee_invoice_id TEXT UNIQUE,
  chargebee_payment_id TEXT,
  amount_cents         INT  NOT NULL DEFAULT 0,
  currency             TEXT NOT NULL DEFAULT 'USD',
  status               TEXT NOT NULL DEFAULT 'paid'
                         CHECK (status IN ('paid','payment_due','failed','refunded','voided')),
  description          TEXT,                 -- "Starter plan — Jan 2026"
  invoice_url          TEXT,                 -- Chargebee hosted invoice / PDF
  paid_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_payments_updated ON payments;
CREATE TRIGGER trg_payments_updated
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payments_workspace ON payments (workspace_id, created_at DESC);

-- Workspace members may READ their invoices; no user writes.
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pay_select ON payments;
CREATE POLICY pay_select ON payments
  FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace_id());
