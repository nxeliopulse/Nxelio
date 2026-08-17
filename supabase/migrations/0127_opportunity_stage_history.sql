-- ============================================================================
-- 0127_opportunity_stage_history.sql
--
-- Phase 2 item: real stage-to-stage conversion tracking for Pipeline
-- Analytics. Until now, "Stage Conversion" was approximated as "reached
-- this stage or later" (a waterfall proxy, documented in analytics-pipeline.ts)
-- because there was no history of when an opportunity actually moved between
-- stages. This adds a real, trigger-populated log, so future stage moves are
-- captured going forward with zero app-code changes needed to keep logging.
--
-- Existing opportunities get a one-row backfill (their current stage, at the
-- closest real timestamp available) — this is NOT a reconstruction of their
-- real history (that data was never captured), it's a starting point so every
-- opportunity has at least one row and the trigger's future data builds on
-- a complete base.
-- ============================================================================

CREATE TABLE IF NOT EXISTS opportunity_stage_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  from_stage     TEXT,
  to_stage       TEXT NOT NULL,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opp_stage_history_opp ON opportunity_stage_history (opportunity_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_opp_stage_history_workspace ON opportunity_stage_history (workspace_id, changed_at);

-- SECURITY DEFINER so the log write never depends on the acting user's own
-- grants on this table (which intentionally has no INSERT policy for
-- authenticated users below — same "system writes, users only read" pattern
-- as credit_ledger/promotion_redemptions).
CREATE OR REPLACE FUNCTION log_opportunity_stage_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO opportunity_stage_history (workspace_id, opportunity_id, from_stage, to_stage, changed_at)
    VALUES (NEW.workspace_id, NEW.id, NULL, NEW.stage, now());
  ELSIF (TG_OP = 'UPDATE') AND (NEW.stage IS DISTINCT FROM OLD.stage) THEN
    INSERT INTO opportunity_stage_history (workspace_id, opportunity_id, from_stage, to_stage, changed_at)
    VALUES (NEW.workspace_id, NEW.id, OLD.stage, NEW.stage, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunity_stage_history ON opportunities;
CREATE TRIGGER trg_opportunity_stage_history
  AFTER INSERT OR UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION log_opportunity_stage_change();

-- Backfill — one row per existing opportunity with no history yet.
INSERT INTO opportunity_stage_history (workspace_id, opportunity_id, from_stage, to_stage, changed_at)
SELECT o.workspace_id, o.id, NULL, o.stage, COALESCE(o.closed_at, o.updated_at, o.created_at)
FROM opportunities o
WHERE o.workspace_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM opportunity_stage_history h WHERE h.opportunity_id = o.id);

ALTER TABLE opportunity_stage_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunity_stage_history_read ON opportunity_stage_history;
CREATE POLICY opportunity_stage_history_read
  ON opportunity_stage_history FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );
-- Deliberately no INSERT/UPDATE/DELETE policy for authenticated users — the
-- SECURITY DEFINER trigger above is the only writer.
