-- ============================================================================
-- 0028 — Feature access matrix (data-driven feature gates)
-- Additive only. A row (plan_code, feature_key, enabled=true) GRANTS a feature.
-- Absence of a row = denied. Flip access by editing data, never code.
-- ============================================================================

CREATE TABLE IF NOT EXISTS feature_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FK to the plan catalog by its stable code (UNIQUE in 0027).
  plan_code   TEXT NOT NULL REFERENCES subscription_plans(code) ON DELETE CASCADE,
  -- App-level capability key: 'lead_discovery', 'reply_tracking', etc.
  feature_key TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_code, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_feature_access_plan ON feature_access (plan_code);

-- Reference data: readable by any signed-in user, never user-writable.
ALTER TABLE feature_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fa_select_authenticated ON feature_access;
CREATE POLICY fa_select_authenticated ON feature_access
  FOR SELECT TO authenticated USING (TRUE);

-- Seed the matrix from Phase 2 §2.3. Only GRANTED features are inserted.
INSERT INTO feature_access (plan_code, feature_key) VALUES
  -- Basic: import + AI scoring + enrichment only.
  ('basic',   'csv_import'),
  ('basic',   'lead_enrichment'),
  ('basic',   'ai_scoring'),
  -- Starter: everything in Basic + discovery, CRM export, LinkedIn, automation.
  ('starter', 'csv_import'),
  ('starter', 'lead_enrichment'),
  ('starter', 'ai_scoring'),
  ('starter', 'lead_discovery'),
  ('starter', 'crm_export'),
  ('starter', 'linkedin_outreach'),
  ('starter', 'automation'),
  -- Pro: everything in Starter + reply tracking + priority support.
  ('pro',     'csv_import'),
  ('pro',     'lead_enrichment'),
  ('pro',     'ai_scoring'),
  ('pro',     'lead_discovery'),
  ('pro',     'crm_export'),
  ('pro',     'linkedin_outreach'),
  ('pro',     'automation'),
  ('pro',     'reply_tracking'),
  ('pro',     'priority_support')
ON CONFLICT (plan_code, feature_key) DO UPDATE SET enabled = TRUE;
