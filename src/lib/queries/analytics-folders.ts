"use server";
import { createClient } from "@/lib/supabase/server";

export type FolderType = "dashboard" | "report";

export interface FolderRow {
  id: string;
  type: FolderType;
  parentFolderId: string | null;
  name: string;
  sortOrder: number;
}

interface DbFolderRow {
  id: string;
  type: FolderType;
  parent_folder_id: string | null;
  name: string;
  sort_order: number;
}

function rowToFolder(r: DbFolderRow): FolderRow {
  return { id: r.id, type: r.type, parentFolderId: r.parent_folder_id, name: r.name, sortOrder: r.sort_order };
}

export async function listFolders(type: FolderType): Promise<FolderRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analytics_folders")
    .select("id, type, parent_folder_id, name, sort_order")
    .eq("type", type)
    .order("sort_order");
  if (error) {
    console.error("[analytics-folders] listFolders failed:", error.message);
    return [];
  }
  return (data as DbFolderRow[]).map(rowToFolder);
}

export async function createFolder(input: { type: FolderType; name: string; parentFolderId?: string | null; sortOrder?: number }): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analytics_folders")
    .insert({ type: input.type, name: input.name, parent_folder_id: input.parentFolderId ?? null, sort_order: input.sortOrder ?? 0 })
    .select("id")
    .single();
  if (error) {
    console.error("[analytics-folders] createFolder failed:", error.message);
    return null;
  }
  return { id: data.id };
}

export async function renameFolder(id: string, name: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("analytics_folders").update({ name }).eq("id", id);
  if (error) {
    console.error("[analytics-folders] renameFolder failed:", error.message);
    return false;
  }
  return true;
}

export async function moveFolder(id: string, parentFolderId: string | null): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("analytics_folders").update({ parent_folder_id: parentFolderId }).eq("id", id);
  if (error) {
    console.error("[analytics-folders] moveFolder failed:", error.message);
    return false;
  }
  return true;
}

/** Deletes a folder. Its contents (dashboards/reports/sub-folders) are
 *  reassigned to root by the FK's ON DELETE SET NULL / ON DELETE CASCADE —
 *  a category being removed should never silently delete the items in it. */
export async function deleteFolder(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("analytics_folders").delete().eq("id", id);
  if (error) {
    console.error("[analytics-folders] deleteFolder failed:", error.message);
    return false;
  }
  return true;
}
