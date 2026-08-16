-- ============================================================================
-- 0131_report_schedules.sql
--
-- Phase 2 item: scheduled CSV email export for the Custom Reports engine
-- (analytics_reports, migration 0089). PDF/Excel export is explicitly out of
-- scope here — this schema has no PDF/Excel-generation library installed
-- yet, and adding one is a dependency decision, not something to slip in
-- silently inside an analytics feature.
-- ============================================================================

CREATE TABLE IF NOT EXISTS report_schedules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  report_id      UUID NOT NULL REFERENCES analytics_reports(id) ON DELETE CASCADE,
  recipients     TEXT[] NOT NULL,
  frequency      TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week    INT CHECK (day_of_week BETWEEN 0 AND 6),   -- 0=Sunday, only used when frequency='weekly'
  day_of_month   INT CHECK (day_of_month BETWEEN 1 AND 28), -- capped at 28 so every month has this day; only used when frequency='monthly'
  hour_utc       INT NOT NULL DEFAULT 8 CHECK (hour_utc BETWEEN 0 AND 23),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  last_sent_at   TIMESTAMPTZ,
  created_by     UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_workspace ON report_schedules (workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_report_schedules_report ON report_schedules (report_id);

DROP TRIGGER IF EXISTS trg_report_schedules_updated ON report_schedules;
CREATE TRIGGER trg_report_schedules_updated
  BEFORE UPDATE ON report_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;

-- Same workspace-scoped, all-member CRUD convention as analytics_reports
-- itself (0089) — anyone who can see/build a report can schedule it.
DROP POLICY IF EXISTS ws_select_report_schedules ON report_schedules;
CREATE POLICY ws_select_report_schedules ON report_schedules FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_insert_report_schedules ON report_schedules;
CREATE POLICY ws_insert_report_schedules ON report_schedules FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_update_report_schedules ON report_schedules;
CREATE POLICY ws_update_report_schedules ON report_schedules FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_delete_report_schedules ON report_schedules;
CREATE POLICY ws_delete_report_schedules ON report_schedules FOR DELETE TO authenticated
  USING (workspace_id = get_current_workspace_id());

-- Optional Supabase pg_cron setup (replace URL and secret storage for the deployment):
-- SELECT cron.schedule('nxelio-report-schedules-hourly', '0 * * * *',
--   $$SELECT net.http_get(url := 'https://YOUR_APP_URL/api/analytics/report-schedules/cron',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_REPORT_SCHEDULE_CRON_SECRET'));$$);
