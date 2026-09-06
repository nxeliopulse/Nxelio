-- Stores the AI-generated "Company Score" shown in Settings > Profile's
-- Business Details card — a genuine AI read of the workspace's OWN business
-- (onboarding profile + a live fetch of their company website), not a rollup
-- of lead scores. One JSONB blob is enough: it's re-generated wholesale each
-- time, never partially updated.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS company_score JSONB;
