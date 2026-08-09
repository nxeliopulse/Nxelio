-- ============================================================================
-- 0117_lead_tags_priority_projects.sql
--
-- Replaces the lead detail page's fake, unsaved Tags/Priority/Projects UI
-- (hardcoded "Collab"/"VIP" badges, a Priority dropdown that reset on every
-- reload, hardcoded "Devops Design"/"Margrate Design" project labels) with
-- real, persisted fields.
-- ============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE leads ADD COLUMN IF NOT EXISTS projects TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'Medium'
  CHECK (priority IN ('High', 'Medium', 'Low'));
