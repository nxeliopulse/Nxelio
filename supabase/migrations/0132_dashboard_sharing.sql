-- ============================================================================
-- 0132_dashboard_sharing.sql
--
-- Phase 2 item: dashboard sharing/visibility (private vs. shared with the
-- whole workspace) and a persisted global date-range filter applied across
-- every non-system widget on a dashboard.
--
-- Widget resize is NOT a schema change — analytics_dashboard_widgets already
-- has width/height (migration 0089); this phase wires an actual UI control
-- to the width column (the only dimension the current 12-col grid renders).
-- ============================================================================

ALTER TABLE analytics_dashboards ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private', 'workspace'));
ALTER TABLE analytics_dashboards ADD COLUMN IF NOT EXISTS global_filters JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Tighten analytics_dashboards' SELECT/UPDATE/DELETE policies (from 0089's
-- generic per-table loop) to also respect visibility: a private dashboard
-- is invisible to, and un-editable by, anyone but its creator.
DROP POLICY IF EXISTS ws_select_analytics_dashboards ON analytics_dashboards;
CREATE POLICY ws_select_analytics_dashboards ON analytics_dashboards FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace_id() AND (visibility = 'workspace' OR created_by = auth.uid()));

DROP POLICY IF EXISTS ws_update_analytics_dashboards ON analytics_dashboards;
CREATE POLICY ws_update_analytics_dashboards ON analytics_dashboards FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace_id() AND (visibility = 'workspace' OR created_by = auth.uid()));

DROP POLICY IF EXISTS ws_delete_analytics_dashboards ON analytics_dashboards;
CREATE POLICY ws_delete_analytics_dashboards ON analytics_dashboards FOR DELETE TO authenticated
  USING (workspace_id = get_current_workspace_id() AND (visibility = 'workspace' OR created_by = auth.uid()));

-- Widgets follow their parent dashboard's visibility.
DROP POLICY IF EXISTS ws_select_analytics_dashboard_widgets ON analytics_dashboard_widgets;
CREATE POLICY ws_select_analytics_dashboard_widgets ON analytics_dashboard_widgets FOR SELECT TO authenticated
  USING (
    workspace_id = get_current_workspace_id()
    AND EXISTS (SELECT 1 FROM analytics_dashboards d WHERE d.id = dashboard_id AND (d.visibility = 'workspace' OR d.created_by = auth.uid()))
  );

DROP POLICY IF EXISTS ws_update_analytics_dashboard_widgets ON analytics_dashboard_widgets;
CREATE POLICY ws_update_analytics_dashboard_widgets ON analytics_dashboard_widgets FOR UPDATE TO authenticated
  USING (
    workspace_id = get_current_workspace_id()
    AND EXISTS (SELECT 1 FROM analytics_dashboards d WHERE d.id = dashboard_id AND (d.visibility = 'workspace' OR d.created_by = auth.uid()))
  );

DROP POLICY IF EXISTS ws_delete_analytics_dashboard_widgets ON analytics_dashboard_widgets;
CREATE POLICY ws_delete_analytics_dashboard_widgets ON analytics_dashboard_widgets FOR DELETE TO authenticated
  USING (
    workspace_id = get_current_workspace_id()
    AND EXISTS (SELECT 1 FROM analytics_dashboards d WHERE d.id = dashboard_id AND (d.visibility = 'workspace' OR d.created_by = auth.uid()))
  );
