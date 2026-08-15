-- ============================================================================
-- Lead provider settings — platform-wide (not per-workspace), Super Admin
-- panel (/admin) only. Lets the platform admin toggle which data source Buy
-- Leads uses to find people: Anysite (their own LinkedIn database + email
-- lookup, paid per credit) or Bright Data (Google/LinkedIn SERP search, the
-- original implementation). Both stay fully wired — this only decides which
-- one runs. Actual API keys stay in env vars (ANYSITE_API_KEY,
-- BRIGHTDATA_API_KEY) — this table only stores WHICH provider is active.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_provider_settings (
  id               INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- single-row table
  active_provider  TEXT NOT NULL DEFAULT 'bright_data' CHECK (active_provider IN ('anysite', 'bright_data')),
  updated_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO lead_provider_settings (id, active_provider)
VALUES (1, 'bright_data')
ON CONFLICT (id) DO NOTHING;

-- RLS enabled with NO policies for any role — only the service-role admin
-- client (used exclusively by the /admin panel and the buy-leads resolver)
-- can reach this table at all.
ALTER TABLE lead_provider_settings ENABLE ROW LEVEL SECURITY;
