-- ============================================================================
-- 0078 — Per-lead favorite/star flag
-- Lets a user star a lead for quick reference in the Leads table, independent
-- of status/score. Defaults to false so every existing row is unaffected.
-- ============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_is_favorite ON leads(is_favorite) WHERE is_favorite = true;
