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

/**
 * Every login belongs to exactly one workspace, assigned at signup — there is
 * no self-service create/switch anymore (moving workspaces is an Admin-only
 * transfer, see transferUserToWorkspace in queries/users.ts). The one case
 * where a login can legitimately have none yet is an Admin-invited account
 * whose workspace hasn't been set up. Call this before any lead-creation path
 * (manual add, CSV import, Buy Leads) so that case is blocked with a clear
 * message instead of silently inserting a workspace-less, invisible lead.
 */
export async function assertHasWorkspace(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase.from("users").select("workspace_id").eq("user_id", user.id).single();
  if (!profile?.workspace_id) {
    throw new Error("You need a workspace before adding leads. Contact your admin to set one up.");
  }
}
