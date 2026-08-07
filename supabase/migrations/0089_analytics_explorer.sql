-- ============================================================================
-- 0089 — Analytics Explorer: real, persisted multi-dashboard/report system
-- replacing the single fixed Analytics page's hardcoded tabs/panels.
--
-- Five new tables (workspace-shared, same convention as segments/picklists):
--   analytics_folders           — category tree, shared by dashboards and reports
--   analytics_reports           — a saved, reusable query definition (or, for
--                                  legacy panels, a pointer to existing
--                                  analytics.ts computation via system_key)
--   analytics_dashboards        — a named collection of widgets
--   analytics_dashboard_widgets — join: which report appears on which
--                                  dashboard, and in what order/size
--   analytics_saved_filters     — real replacement for the old hardcoded
--                                  3-preset "Saved Views" array
--
-- Every existing tab/panel from the current analytics-view.tsx is seeded here
-- so rollout is zero-regression: every workspace immediately sees its current
-- 6 tabs reproduced as 6 dashboards in the new Explorer. Panels that only
-- analytics.ts already knows how to compute (row-level feeds, forecasts,
-- anything reading lead_activities) keep system_key set and render through
-- that existing, unchanged code; panels expressible as a plain
-- data-source + metric + group-by are seeded as real, generic reports.
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_folders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type             VARCHAR(20) NOT NULL, -- 'dashboard' | 'report'
  parent_folder_id UUID REFERENCES analytics_folders(id) ON DELETE CASCADE,
  name             VARCHAR(150) NOT NULL,
  sort_order       INT NOT NULL DEFAULT 0,
  created_by       UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_folders_workspace ON analytics_folders(workspace_id, type, parent_folder_id);

CREATE TABLE IF NOT EXISTS analytics_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  folder_id         UUID REFERENCES analytics_folders(id) ON DELETE SET NULL,
  name              VARCHAR(200) NOT NULL,
  description       TEXT,
  -- 'leads' | 'opportunities' | 'campaigns' | 'accounts' | 'contacts'
  data_source       VARCHAR(30) NOT NULL,
  -- {"type":"count"} | {"type":"sum","column":"..."} | {"type":"avg","column":"..."}
  metric            JSONB NOT NULL DEFAULT '{"type":"count"}'::jsonb,
  group_by          VARCHAR(100),
  group_by_interval VARCHAR(10), -- 'day' | 'week' | 'month' | 'year' — only when group_by is a date field
  filters           JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 'kpi' | 'bar' | 'column' | 'line' | 'area' | 'donut' | 'table' | 'funnel' | 'gauge' | (system-only: 'heatmap'|'radar'|'scatter')
  chart_type        VARCHAR(20) NOT NULL DEFAULT 'bar',
  -- non-null ONLY for legacy panels whose computation bypasses the generic
  -- engine and instead renders via the existing analytics.ts functions.
  system_key        VARCHAR(50),
  is_system         BOOLEAN NOT NULL DEFAULT false,
  created_by        UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_reports_workspace ON analytics_reports(workspace_id, folder_id);

CREATE TABLE IF NOT EXISTS analytics_dashboards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  folder_id    UUID REFERENCES analytics_folders(id) ON DELETE SET NULL,
  name         VARCHAR(200) NOT NULL,
  description  TEXT,
  icon         VARCHAR(50),
  is_system    BOOLEAN NOT NULL DEFAULT false,
  sort_order   INT NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_dashboards_workspace ON analytics_dashboards(workspace_id, folder_id);

CREATE TABLE IF NOT EXISTS analytics_dashboard_widgets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  dashboard_id   UUID NOT NULL REFERENCES analytics_dashboards(id) ON DELETE CASCADE,
  report_id      UUID NOT NULL REFERENCES analytics_reports(id) ON DELETE CASCADE,
  title_override VARCHAR(200),
  pos_x          INT NOT NULL DEFAULT 0,
  pos_y          INT NOT NULL DEFAULT 0,
  width          INT NOT NULL DEFAULT 6,  -- 12-col grid; legacy span "half"=6, "full"=12
  height         INT NOT NULL DEFAULT 4,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_widgets_dashboard ON analytics_dashboard_widgets(dashboard_id, sort_order);

CREATE TABLE IF NOT EXISTS analytics_saved_filters (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(150) NOT NULL,
  filters      JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  created_by   UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_saved_filters_workspace ON analytics_saved_filters(workspace_id);

-- Standard workspace-scoped RLS + auto-workspace + updated_at triggers, same
-- template as 0076_accounts_contacts.sql.
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'analytics_folders','analytics_reports','analytics_dashboards',
    'analytics_dashboard_widgets','analytics_saved_filters'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS auto_workspace_trigger ON %I;', t);
    EXECUTE format('CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON %I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t, t);

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_select_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_insert_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_update_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_delete_%s ON %I;', t, t);
    EXECUTE format('CREATE POLICY ws_select_%s ON %I FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_insert_%s ON %I FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_update_%s ON %I FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_delete_%s ON %I FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
  END LOOP;
END $$;

-- ============================================================================
-- Seeding: 5 fixed category folders (for both dashboards and reports), 6
-- default dashboards reproducing today's 6 tabs, and one report+widget per
-- existing panel (27 total). Idempotent by name-within-workspace checks so
-- re-running (or the new-workspace trigger firing once per signup) never
-- duplicates rows.
-- ============================================================================
CREATE OR REPLACE FUNCTION seed_default_analytics_for_workspace(p_workspace_id UUID) RETURNS VOID AS $$
DECLARE
  f_sales_d UUID; f_pipeline_d UUID; f_marketing_d UUID; f_activity_d UUID; f_lead_d UUID;
  f_sales_r UUID; f_pipeline_r UUID; f_marketing_r UUID; f_activity_r UUID; f_lead_r UUID;
  dash_overview UUID; dash_pipeline UUID; dash_revenue UUID; dash_campaigns UUID; dash_activity UUID; dash_accounts UUID;
  rid UUID;
BEGIN
  -- Skip entirely if this workspace already has any dashboard (idempotent re-run guard).
  IF EXISTS (SELECT 1 FROM analytics_dashboards WHERE workspace_id = p_workspace_id) THEN
    RETURN;
  END IF;

  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'dashboard', 'Sales Reports', 1) RETURNING id INTO f_sales_d;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'dashboard', 'Pipeline Reports', 2) RETURNING id INTO f_pipeline_d;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'dashboard', 'Marketing Reports', 3) RETURNING id INTO f_marketing_d;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'dashboard', 'Activity Reports', 4) RETURNING id INTO f_activity_d;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'dashboard', 'Lead Reports', 5) RETURNING id INTO f_lead_d;

  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'report', 'Sales Reports', 1) RETURNING id INTO f_sales_r;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'report', 'Pipeline Reports', 2) RETURNING id INTO f_pipeline_r;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'report', 'Marketing Reports', 3) RETURNING id INTO f_marketing_r;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'report', 'Activity Reports', 4) RETURNING id INTO f_activity_r;
  INSERT INTO analytics_folders (workspace_id, type, name, sort_order) VALUES (p_workspace_id, 'report', 'Lead Reports', 5) RETURNING id INTO f_lead_r;

  -- ── Overview → Sales Reports ────────────────────────────────────────────
  INSERT INTO analytics_dashboards (workspace_id, folder_id, name, icon, is_system, sort_order)
    VALUES (p_workspace_id, f_sales_d, 'Overview', 'trending-up', true, 1) RETURNING id INTO dash_overview;

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Overall Sales & Engagement', 'opportunities', 'area', 'ov-combo', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_overview, rid, 12, 4, 1);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, metric, group_by, chart_type, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Revenue Split', 'opportunities', '{"type":"sum","column":"deal_value"}'::jsonb, 'stage', 'donut', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_overview, rid, 6, 4, 2);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Recent Prospect Streams', 'leads', 'table', 'ov-leads', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_overview, rid, 6, 4, 3);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Top Open Opportunities', 'opportunities', 'table', 'ov-opps', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_overview, rid, 12, 4, 4);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Threshold Alerts', 'leads', 'kpi', 'ov-insights', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_overview, rid, 6, 4, 5);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Activity Logs Feed', 'leads', 'table', 'ov-activity', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_overview, rid, 6, 4, 6);

  -- ── Pipeline → Pipeline Reports ──────────────────────────────────────────
  INSERT INTO analytics_dashboards (workspace_id, folder_id, name, icon, is_system, sort_order)
    VALUES (p_workspace_id, f_pipeline_d, 'Pipeline', 'git-branch', true, 2) RETURNING id INTO dash_pipeline;

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, metric, group_by, chart_type, is_system)
    VALUES (p_workspace_id, f_pipeline_r, 'Pipeline Stages Funnel', 'opportunities', '{"type":"count"}'::jsonb, 'stage', 'funnel', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_pipeline, rid, 12, 4, 1);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_pipeline_r, 'Opportunity Aging Pipeline', 'opportunities', 'bar', 'pi-aging', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_pipeline, rid, 6, 4, 2);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, metric, group_by, chart_type, is_system)
    VALUES (p_workspace_id, f_pipeline_r, 'Value Distributed by Stage', 'opportunities', '{"type":"sum","column":"deal_value"}'::jsonb, 'stage', 'bar', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_pipeline, rid, 6, 4, 3);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_pipeline_r, 'Opportunities List Table', 'opportunities', 'table', 'pi-opps', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_pipeline, rid, 12, 4, 4);

  -- ── Revenue Forecast → Sales Reports ─────────────────────────────────────
  INSERT INTO analytics_dashboards (workspace_id, folder_id, name, icon, is_system, sort_order)
    VALUES (p_workspace_id, f_sales_d, 'Revenue Forecast', 'dollar-sign', true, 3) RETURNING id INTO dash_revenue;

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Sales Performance Forecast vs Quota', 'opportunities', 'line', 'rv-forecast', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_revenue, rid, 12, 4, 1);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Win / Loss Reason Analysis', 'opportunities', 'donut', 'rv-winloss', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_revenue, rid, 6, 4, 2);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Revenue Distribution by Source', 'leads', 'donut', 'rv-sources', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_revenue, rid, 6, 4, 3);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, metric, group_by, chart_type, is_system)
    VALUES (p_workspace_id, f_sales_r, 'Pipeline Value by Stage (Detail)', 'opportunities', '{"type":"sum","column":"deal_value"}'::jsonb, 'stage', 'bar', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_revenue, rid, 12, 4, 4);

  -- ── Campaign Engagement → Marketing Reports ──────────────────────────────
  INSERT INTO analytics_dashboards (workspace_id, folder_id, name, icon, is_system, sort_order)
    VALUES (p_workspace_id, f_marketing_d, 'Campaign Engagement', 'mail', true, 4) RETURNING id INTO dash_campaigns;

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, metric, group_by, chart_type, is_system)
    VALUES (p_workspace_id, f_marketing_r, 'Campaign Conversion Comparison', 'campaigns', '{"type":"avg","column":"open_rate"}'::jsonb, 'campaign_name', 'bar', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_campaigns, rid, 12, 4, 1);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_marketing_r, 'Channel Performance Radar Map', 'campaigns', 'radar', 'ca-radar', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_campaigns, rid, 6, 4, 2);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_marketing_r, 'Email Efficiency Bubble Chart', 'campaigns', 'scatter', 'ca-scatter', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_campaigns, rid, 6, 4, 3);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_marketing_r, 'Daily Campaign Email Activity', 'campaigns', 'bar', 'ca-stacked', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_campaigns, rid, 12, 4, 4);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, metric, group_by, chart_type, is_system)
    VALUES (p_workspace_id, f_marketing_r, 'Campaign Performance Leaderboard', 'campaigns', '{"type":"avg","column":"open_rate"}'::jsonb, 'campaign_name', 'table', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_campaigns, rid, 12, 4, 5);

  -- ── Activity Log → Activity Reports (all lead_activities-backed, system) ─
  INSERT INTO analytics_dashboards (workspace_id, folder_id, name, icon, is_system, sort_order)
    VALUES (p_workspace_id, f_activity_d, 'Activity Log', 'activity', true, 5) RETURNING id INTO dash_activity;

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_activity_r, 'Sales Activity Calendar Heatmap', 'leads', 'heatmap', 'ac-heatmap', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_activity, rid, 12, 4, 1);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_activity_r, 'Total Activity Type Breakdown', 'leads', 'donut', 'ac-pie', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_activity, rid, 6, 4, 2);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_activity_r, '7-Day Activity Volatility Trend', 'leads', 'line', 'ac-trend', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_activity, rid, 6, 4, 3);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_activity_r, 'Volume Distribution by Type', 'leads', 'bar', 'ac-bars', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_activity, rid, 12, 4, 4);

  -- ── Account Health → Lead Reports ────────────────────────────────────────
  INSERT INTO analytics_dashboards (workspace_id, folder_id, name, icon, is_system, sort_order)
    VALUES (p_workspace_id, f_lead_d, 'Account Health', 'shield-check', true, 6) RETURNING id INTO dash_accounts;

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_lead_r, 'Account Relationship Health', 'leads', 'bar', 'aa-health', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_accounts, rid, 6, 4, 1);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, metric, group_by, chart_type, is_system)
    VALUES (p_workspace_id, f_lead_r, 'Prospect Source Channel Audit', 'leads', '{"type":"count"}'::jsonb, 'source', 'donut', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_accounts, rid, 6, 4, 2);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_lead_r, 'Prospect Score Value Spread', 'leads', 'bar', 'aa-score', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_accounts, rid, 12, 4, 3);

  INSERT INTO analytics_reports (workspace_id, folder_id, name, data_source, chart_type, system_key, is_system)
    VALUES (p_workspace_id, f_lead_r, 'Interactivity Mix Allocation', 'leads', 'donut', 'aa-mix', true) RETURNING id INTO rid;
  INSERT INTO analytics_dashboard_widgets (workspace_id, dashboard_id, report_id, width, height, sort_order) VALUES (p_workspace_id, dash_accounts, rid, 12, 4, 4);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION seed_default_analytics_trigger_fn() RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_default_analytics_for_workspace(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS seed_default_analytics_trigger ON workspaces;
CREATE TRIGGER seed_default_analytics_trigger AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION seed_default_analytics_trigger_fn();

-- Backfill every workspace that already exists today.
DO $$
DECLARE ws RECORD;
BEGIN
  FOR ws IN SELECT id FROM workspaces LOOP
    PERFORM seed_default_analytics_for_workspace(ws.id);
  END LOOP;
END $$;
