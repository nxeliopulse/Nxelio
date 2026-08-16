"use server";
import { createClient } from "@/lib/supabase/server";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";

export type DashboardVisibility = "private" | "workspace";

export interface DashboardGlobalFilters {
  dateRange?: string;
  customFrom?: string;
  customTo?: string;
}

export interface DashboardSummary {
  id: string;
  folderId: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  isSystem: boolean;
  sortOrder: number;
  updatedAt: string;
  visibility: DashboardVisibility;
  createdBy: string | null;
  globalFilters: DashboardGlobalFilters;
}

export interface DashboardWidget {
  id: string;
  dashboardId: string;
  reportId: string;
  titleOverride: string | null;
  posX: number;
  posY: number;
  width: number;
  height: number;
  sortOrder: number;
}

export interface DashboardWithWidgets extends DashboardSummary {
  widgets: DashboardWidget[];
}

interface DashboardRow {
  id: string;
  folder_id: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  is_system: boolean;
  sort_order: number;
  updated_at: string;
  visibility: DashboardVisibility;
  created_by: string | null;
  global_filters: DashboardGlobalFilters | null;
}

const DASHBOARD_COLUMNS = "id, folder_id, name, description, icon, is_system, sort_order, updated_at, visibility, created_by, global_filters";

function rowToSummary(r: DashboardRow): DashboardSummary {
  return {
    id: r.id,
    folderId: r.folder_id,
    name: r.name,
    description: r.description,
    icon: r.icon,
    isSystem: r.is_system,
    sortOrder: r.sort_order,
    updatedAt: r.updated_at,
    visibility: r.visibility,
    createdBy: r.created_by,
    globalFilters: r.global_filters ?? {},
  };
}

interface WidgetRow {
  id: string;
  dashboard_id: string;
  report_id: string;
  title_override: string | null;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  sort_order: number;
}

function rowToWidget(r: WidgetRow): DashboardWidget {
  return {
    id: r.id,
    dashboardId: r.dashboard_id,
    reportId: r.report_id,
    titleOverride: r.title_override,
    posX: r.pos_x,
    posY: r.pos_y,
    width: r.width,
    height: r.height,
    sortOrder: r.sort_order,
  };
}

export async function listDashboards(folderId?: string | null): Promise<DashboardSummary[]> {
  const supabase = await createClient();
  let query = supabase
    .from("analytics_dashboards")
    .select(DASHBOARD_COLUMNS)
    .order("sort_order");
  if (folderId !== undefined) {
    query = folderId === null ? query.is("folder_id", null) : query.eq("folder_id", folderId);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[analytics-dashboards] listDashboards failed:", error.message);
    return [];
  }
  return (data as DashboardRow[]).map(rowToSummary);
}

export async function getDashboardWithWidgets(id: string): Promise<DashboardWithWidgets | null> {
  const supabase = await createClient();
  const [{ data: dash, error: dashErr }, { data: widgets, error: widgetErr }] = await Promise.all([
    supabase
      .from("analytics_dashboards")
      .select(DASHBOARD_COLUMNS)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("analytics_dashboard_widgets")
      .select("id, dashboard_id, report_id, title_override, pos_x, pos_y, width, height, sort_order")
      .eq("dashboard_id", id)
      .order("sort_order"),
  ]);
  if (dashErr || !dash) return null;
  if (widgetErr) console.error("[analytics-dashboards] widget fetch failed:", widgetErr.message);
  return { ...rowToSummary(dash as DashboardRow), widgets: ((widgets ?? []) as WidgetRow[]).map(rowToWidget) };
}

export async function createDashboard(input: { name: string; folderId: string | null; description?: string; icon?: string; visibility?: DashboardVisibility }): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const ctx = await getAnalyticsContext();
  const { data, error } = await supabase
    .from("analytics_dashboards")
    .insert({
      name: input.name,
      folder_id: input.folderId,
      description: input.description ?? null,
      icon: input.icon ?? null,
      visibility: input.visibility ?? "workspace",
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[analytics-dashboards] createDashboard failed:", error.message);
    return null;
  }
  return { id: data.id };
}

export async function updateDashboardVisibility(id: string, visibility: DashboardVisibility): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("analytics_dashboards").update({ visibility }).eq("id", id);
  if (error) {
    console.error("[analytics-dashboards] updateDashboardVisibility failed:", error.message);
    return false;
  }
  return true;
}

export async function updateDashboardGlobalFilters(id: string, filters: DashboardGlobalFilters): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("analytics_dashboards").update({ global_filters: filters }).eq("id", id);
  if (error) {
    console.error("[analytics-dashboards] updateDashboardGlobalFilters failed:", error.message);
    return false;
  }
  return true;
}

export async function updateDashboard(id: string, input: { name?: string; folderId?: string | null; description?: string | null; icon?: string | null }): Promise<boolean> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.folderId !== undefined) patch.folder_id = input.folderId;
  if (input.description !== undefined) patch.description = input.description;
  if (input.icon !== undefined) patch.icon = input.icon;
  const { error } = await supabase.from("analytics_dashboards").update(patch).eq("id", id);
  if (error) {
    console.error("[analytics-dashboards] updateDashboard failed:", error.message);
    return false;
  }
  return true;
}

export async function deleteDashboard(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("analytics_dashboards").delete().eq("id", id);
  if (error) {
    console.error("[analytics-dashboards] deleteDashboard failed:", error.message);
    return false;
  }
  return true;
}

export async function addWidgetToDashboard(
  dashboardId: string,
  reportId: string,
  layout: { width?: number; height?: number; sortOrder?: number; titleOverride?: string }
): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analytics_dashboard_widgets")
    .insert({
      dashboard_id: dashboardId,
      report_id: reportId,
      width: layout.width ?? 6,
      height: layout.height ?? 4,
      sort_order: layout.sortOrder ?? 0,
      title_override: layout.titleOverride ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[analytics-dashboards] addWidgetToDashboard failed:", error.message);
    return null;
  }
  return { id: data.id };
}

export async function updateWidgetLayout(
  widgetId: string,
  layout: { width?: number; height?: number; sortOrder?: number; posX?: number; posY?: number }
): Promise<boolean> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (layout.width !== undefined) patch.width = layout.width;
  if (layout.height !== undefined) patch.height = layout.height;
  if (layout.sortOrder !== undefined) patch.sort_order = layout.sortOrder;
  if (layout.posX !== undefined) patch.pos_x = layout.posX;
  if (layout.posY !== undefined) patch.pos_y = layout.posY;
  const { error } = await supabase.from("analytics_dashboard_widgets").update(patch).eq("id", widgetId);
  if (error) {
    console.error("[analytics-dashboards] updateWidgetLayout failed:", error.message);
    return false;
  }
  return true;
}

export async function removeWidget(widgetId: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("analytics_dashboard_widgets").delete().eq("id", widgetId);
  if (error) {
    console.error("[analytics-dashboards] removeWidget failed:", error.message);
    return false;
  }
  return true;
}
