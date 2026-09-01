"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { WIDGET_CATALOG, WIDGET_SIZES, WIDGET_SIZE_OPTIONS, type LayoutWidget } from "@/lib/dashboard-widgets";

export interface DashboardLayout {
  id: string;
  name: string;
  widgets: LayoutWidget[];
  isStarred: boolean;
  updatedAt: string;
}

interface LayoutRow {
  id: string;
  name: string;
  widgets: unknown;
  is_starred: boolean;
  updated_at: string;
}

const VALID_KEYS = new Set(WIDGET_CATALOG.map((w) => w.key));
const VALID_SIZES = new Set<number>(WIDGET_SIZE_OPTIONS);

/** Drops anything that isn't a real, current widget key, and falls back to
 *  that widget's catalog default size if a stored size is missing/invalid —
 *  a saved layout can otherwise go stale if a widget is ever renamed/removed
 *  in code, or corrupted by a hand-edited size value. Also accepts the
 *  earlier plain-string-array shape (pre-resize) for backward compatibility. */
function sanitizeWidgets(raw: unknown): LayoutWidget[] {
  if (!Array.isArray(raw)) return [];
  const out: LayoutWidget[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      if (VALID_KEYS.has(entry as LayoutWidget["key"])) out.push({ key: entry as LayoutWidget["key"], size: WIDGET_SIZES[entry as LayoutWidget["key"]] });
      continue;
    }
    if (entry && typeof entry === "object" && "key" in entry && typeof (entry as { key: unknown }).key === "string") {
      const key = (entry as { key: string }).key;
      if (!VALID_KEYS.has(key as LayoutWidget["key"])) continue;
      const rawSize = (entry as { size?: unknown }).size;
      const size = typeof rawSize === "number" && VALID_SIZES.has(rawSize) ? (rawSize as LayoutWidget["size"]) : WIDGET_SIZES[key as LayoutWidget["key"]];
      out.push({ key: key as LayoutWidget["key"], size });
    }
  }
  return out;
}

function rowToLayout(r: LayoutRow): DashboardLayout {
  return { id: r.id, name: r.name, widgets: sanitizeWidgets(r.widgets), isStarred: r.is_starred, updatedAt: r.updated_at };
}

/** All of the current user's saved layouts — RLS already scopes this to
 *  their own rows, so no explicit user_id filter is needed here. */
export async function listDashboardLayouts(): Promise<DashboardLayout[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dashboard_layouts")
    .select("id, name, widgets, is_starred, updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[listDashboardLayouts]", error.message);
    return [];
  }
  return (data as LayoutRow[]).map(rowToLayout);
}

/** The layout id the user last chose to view, plus its resolved widgets —
 *  null widgets/id means "show the built-in System default" (DEFAULT_LAYOUT). */
export async function getActiveDashboardLayout(): Promise<{ id: string | null; widgets: LayoutWidget[] | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { id: null, widgets: null };

  const { data: userRow } = await supabase
    .from("users")
    .select("active_dashboard_layout_id")
    .eq("user_id", user.id)
    .single();
  const activeId = userRow?.active_dashboard_layout_id ?? null;
  if (!activeId) return { id: null, widgets: null };

  const { data: layout } = await supabase
    .from("dashboard_layouts")
    .select("widgets")
    .eq("id", activeId)
    .maybeSingle();
  if (!layout) return { id: null, widgets: null };
  return { id: activeId, widgets: sanitizeWidgets(layout.widgets) };
}

/** Switches which saved layout (or null for System default) the current
 *  user sees on their next visit to /dashboard. */
export async function setActiveDashboardLayout(layoutId: string | null): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase
    .from("users")
    .update({ active_dashboard_layout_id: layoutId })
    .eq("user_id", user.id);
  if (error) {
    console.error("[setActiveDashboardLayout]", error.message);
    return false;
  }
  revalidatePath("/dashboard");
  return true;
}

export async function createDashboardLayout(name: string, widgets: LayoutWidget[]): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("users").select("workspace_id").eq("user_id", user.id).single();
  if (!profile?.workspace_id) return null;

  const { data, error } = await supabase
    .from("dashboard_layouts")
    .insert({ workspace_id: profile.workspace_id, user_id: user.id, name: name.trim().slice(0, 100), widgets: sanitizeWidgets(widgets) })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[createDashboardLayout]", error?.message);
    return null;
  }
  revalidatePath("/dashboard");
  return { id: data.id };
}

export async function updateDashboardLayout(id: string, patch: { name?: string; widgets?: LayoutWidget[]; isStarred?: boolean }): Promise<boolean> {
  const supabase = await createClient();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 100);
  if (patch.widgets !== undefined) update.widgets = sanitizeWidgets(patch.widgets);
  if (patch.isStarred !== undefined) update.is_starred = patch.isStarred;
  if (Object.keys(update).length === 0) return true;

  const { error } = await supabase.from("dashboard_layouts").update(update).eq("id", id);
  if (error) {
    console.error("[updateDashboardLayout]", error.message);
    return false;
  }
  revalidatePath("/dashboard");
  return true;
}

/** Deletes a saved layout. Anyone currently viewing it falls back to the
 *  System default automatically — active_dashboard_layout_id references
 *  this table ON DELETE SET NULL. */
export async function deleteDashboardLayout(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("dashboard_layouts").delete().eq("id", id);
  if (error) {
    console.error("[deleteDashboardLayout]", error.message);
    return false;
  }
  revalidatePath("/dashboard");
  return true;
}
