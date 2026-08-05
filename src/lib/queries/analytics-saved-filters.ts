"use server";
import { createClient } from "@/lib/supabase/server";

/** Real replacement for the old Analytics page's hardcoded 3-preset "Saved
 *  Views" array — filters shape is caller-defined (the global filter bar's
 *  FilterState today; a FilterCondition[] once the builder is wired up). */
export interface SavedFilter {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  isDefault: boolean;
}

interface SavedFilterRow {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  is_default: boolean;
}

function rowToSavedFilter(r: SavedFilterRow): SavedFilter {
  return { id: r.id, name: r.name, filters: r.filters, isDefault: r.is_default };
}

export async function listSavedFilters(): Promise<SavedFilter[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analytics_saved_filters")
    .select("id, name, filters, is_default")
    .order("created_at");
  if (error) {
    console.error("[analytics-saved-filters] listSavedFilters failed:", error.message);
    return [];
  }
  return (data as SavedFilterRow[]).map(rowToSavedFilter);
}

export async function createSavedFilter(name: string, filters: Record<string, unknown>): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analytics_saved_filters")
    .insert({ name, filters })
    .select("id")
    .single();
  if (error) {
    console.error("[analytics-saved-filters] createSavedFilter failed:", error.message);
    return null;
  }
  return { id: data.id };
}

export async function updateSavedFilter(id: string, input: { name?: string; filters?: Record<string, unknown> }): Promise<boolean> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.filters !== undefined) patch.filters = input.filters;
  const { error } = await supabase.from("analytics_saved_filters").update(patch).eq("id", id);
  if (error) {
    console.error("[analytics-saved-filters] updateSavedFilter failed:", error.message);
    return false;
  }
  return true;
}

export async function deleteSavedFilter(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("analytics_saved_filters").delete().eq("id", id);
  if (error) {
    console.error("[analytics-saved-filters] deleteSavedFilter failed:", error.message);
    return false;
  }
  return true;
}
