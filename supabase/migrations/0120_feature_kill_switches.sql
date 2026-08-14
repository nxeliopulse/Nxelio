-- ============================================================================
-- Feature kill switches — platform-wide (not per-workspace), Platform Admin
-- panel (/admin) only. Lets the platform admin (admin@nxelio.com) globally
-- pause outbound sending across every workspace at once: campaign launches
-- (including already-running sequence follow-up steps), ad-hoc one-off email
-- sends (Leads/Contacts/Accounts/Activities compose), and newsletter sends.
-- Defaults to TRUE for all three so this migration changes no behavior until
-- the admin actually flips a switch off.
-- ============================================================================

CREATE TABLE IF NOT EXISTS feature_kill_switches (
  feature_key TEXT PRIMARY KEY CHECK (feature_key IN ('launch_campaign', 'send_email', 'send_newsletter')),
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO feature_kill_switches (feature_key, enabled) VALUES
  ('launch_campaign', TRUE),
  ('send_email', TRUE),
  ('send_newsletter', TRUE)
ON CONFLICT (feature_key) DO NOTHING;

-- RLS enabled with NO policies for any role — only the service-role admin
-- client (used exclusively by src/lib/queries/feature-kill-switches.ts) can
-- reach this table at all. Same pattern as ai_provider_settings (0062).
ALTER TABLE feature_kill_switches ENABLE ROW LEVEL SECURITY;
