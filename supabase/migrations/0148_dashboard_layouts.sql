-- ============================================================================
-- 0148_dashboard_layouts.sql
--
-- Per-person customizable layouts for the main /dashboard home page (widget
-- library + drag-to-reorder, modeled after Apollo.io's "Edit layout"). This
-- is deliberately a separate, much simpler table from the existing
-- analytics_dashboards/analytics_dashboard_widgets system (0089/0132) — that
-- system is a generic BI report-builder (ad-hoc reports under /analytics,
-- report_id-based widgets, workspace-shared); this one just orders a fixed
-- catalog of already-built dashboard widgets (see src/lib/dashboard-widgets.ts)
-- for one person's home dashboard. Trying to force the two into one schema
-- would mean turning every home-dashboard widget into a fake "report" for no
-- real benefit.
-- ============================================================================

CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  -- Ordered array of {key, size} objects — key from the WIDGET_CATALOG in
  -- src/lib/dashboard-widgets.ts, size the widget's dragged grid-column
  -- span (3/4/6/8/12). Validated app-side against the known catalog/size
  -- options on save, not DB-side — new widget types ship in code without a
  -- migration, and sanitizeWidgets() also accepts the earlier plain
  -- string-array shape for backward compatibility.
  widgets JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_starred BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_layouts_user ON dashboard_layouts(user_id);

CREATE TRIGGER trg_dashboard_layouts_updated BEFORE UPDATE ON dashboard_layouts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Which saved layout (if any) each person is currently viewing — null means
-- "the built-in System default". Lives on users, not dashboard_layouts,
-- since it's per-viewer state, not part of a layout's own definition.
ALTER TABLE users ADD COLUMN IF NOT EXISTS active_dashboard_layout_id UUID REFERENCES dashboard_layouts(id) ON DELETE SET NULL;

-- 0081_workspace_members.sql revoked blanket UPDATE on users and granted it
-- back column-by-column (same pattern 0088_tour_state.sql followed for
-- tour_state) — a new column needs its own grant or self-updates fail with
-- "permission denied for table users" (a GRANT-level error, RLS never even
-- gets evaluated).
GRANT UPDATE (active_dashboard_layout_id) ON users TO authenticated;

ALTER TABLE dashboard_layouts ENABLE ROW LEVEL SECURITY;

-- Strictly per-person — even other members of the same workspace can't see
-- or touch someone else's saved dashboard layout.
CREATE POLICY own_select_dashboard_layouts ON dashboard_layouts FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY own_insert_dashboard_layouts ON dashboard_layouts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND workspace_id = get_current_workspace_id());
CREATE POLICY own_update_dashboard_layouts ON dashboard_layouts FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY own_delete_dashboard_layouts ON dashboard_layouts FOR DELETE TO authenticated
  USING (user_id = auth.uid());
