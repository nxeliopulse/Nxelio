"use server";
import { createClient } from "@/lib/supabase/server";

export interface WorkspaceInfo {
  id: string;
  name: string;
  capture_slug: string;
}

export async function getCurrentWorkspace(): Promise<WorkspaceInfo | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("users").select("workspace_id").eq("user_id", user.id).single();
  if (!profile?.workspace_id) return null;
  const { data: ws } = await supabase.from("workspaces").select("id, name, capture_slug").eq("id", profile.workspace_id).single();
  return ws as WorkspaceInfo | null;
}
