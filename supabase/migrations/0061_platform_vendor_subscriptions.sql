-- ============================================================================
-- Platform vendor subscriptions — Nxelio's OWN paid third-party accounts
-- (Unipile, AnySite, Brevo, etc.), tracked manually by the platform admin since
-- none of these vendors expose a billing/usage API we integrate with. Shown on
-- the /admin panel's Overview. Not customer-facing, not workspace-scoped.
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_vendor_subscriptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name        TEXT NOT NULL,        -- e.g. "Unipile", "AnySite", "Brevo"
  plan_name          TEXT,                 -- e.g. "Pro", "Pay-as-you-go"
  monthly_cost_cents INTEGER,
  renewal_date       DATE,
  usage_notes        TEXT,                 -- free-text, e.g. "4,200 / 10,000 emails sent this cycle"
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON platform_vendor_subscriptions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform_vendor_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS enabled with NO policies for any role — only the service-role admin
-- client (used exclusively by the /admin panel) can reach this table at all.
ALTER TABLE platform_vendor_subscriptions ENABLE ROW LEVEL SECURITY;
