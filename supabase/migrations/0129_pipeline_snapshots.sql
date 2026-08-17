-- ============================================================================
-- 0129_pipeline_snapshots.sql
--
-- Phase 2 item: daily pipeline snapshots, unlocking a real Pipeline Trend
-- chart and Forecast Accuracy/Slippage on Revenue Analytics. Until now,
-- "Pipeline Trend" had no historical series to draw from — pipeline value is
-- only ever queried live, as of right now. One row per workspace per day
-- gives a genuine time series going forward.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipeline_snapshots (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  snapshot_date            DATE NOT NULL,
  total_pipeline_value     NUMERIC(14,2) NOT NULL DEFAULT 0,
  weighted_pipeline_value  NUMERIC(14,2) NOT NULL DEFAULT 0,
  open_deal_count          INT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_snapshots_workspace_date ON pipeline_snapshots (workspace_id, snapshot_date);

ALTER TABLE pipeline_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipeline_snapshots_read ON pipeline_snapshots;
CREATE POLICY pipeline_snapshots_read
  ON pipeline_snapshots FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );
-- Deliberately no INSERT/UPDATE/DELETE policy for authenticated users — only
-- the protected cron route (using the service-role client) writes here, same
-- "system writes, users only read" pattern as opportunity_stage_history.

-- Optional Supabase pg_cron setup (replace URL and secret storage for the deployment):
-- SELECT cron.schedule('nxelio-pipeline-snapshot-daily', '5 0 * * *',
--   $$SELECT net.http_get(url := 'https://YOUR_APP_URL/api/analytics/pipeline-snapshot/cron',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_PIPELINE_SNAPSHOT_CRON_SECRET'));$$);
