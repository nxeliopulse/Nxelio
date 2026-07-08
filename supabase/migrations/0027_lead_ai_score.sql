-- Persist the full AI prospect-score breakdown (overall, dimensions, insight,
-- next steps) so it survives reloads instead of living only in component state.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_score JSONB;
