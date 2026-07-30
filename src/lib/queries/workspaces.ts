"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/queries/audit-log";
import { revalidatePath } from "next/cache";

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

export interface MyWorkspaceRow {
  id: string;
  name: string;
  roleId: number;
  isActive: boolean;
}

/** Every workspace the current login belongs to, for the workspace switcher. */
export async function getMyWorkspaces(): Promise<MyWorkspaceRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase.from("users").select("workspace_id").eq("user_id", user.id).single();
  const activeWorkspaceId = profile?.workspace_id ?? null;

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role_id, workspaces(id, name)")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE");
  if (error || !data) return [];

  return data
    .map((m) => {
      const ws = m.workspaces as unknown as { id: string; name: string } | null;
      if (!ws) return null;
      return { id: ws.id, name: ws.name, roleId: m.role_id as number, isActive: ws.id === activeWorkspaceId };
    })
    .filter((w): w is MyWorkspaceRow => w !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface SwitchWorkspaceResult {
  ok: boolean;
  error?: string;
}

/**
 * Makes `workspaceId` the caller's active workspace — every RLS-scoped query
 * across the app reads this off users.workspace_id, so this is the one place
 * that pointer may change. Validated against workspace_members (never trust
 * the client), and written via the admin client since a plain client update
 * to workspace_id/role_id is now blocked at the grant level (see migration
 * 0080_workspace_members.sql).
 */
export async function switchWorkspace(workspaceId: string): Promise<SwitchWorkspaceResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated" };

    const admin = createAdminClient();
    const { data: membership } = await admin
      .from("workspace_members")
      .select("role_id")
      .eq("user_id", user.id)
      .eq("workspace_id", workspaceId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (!membership) return { ok: false, error: "You're not a member of that workspace." };

    const { error } = await admin
      .from("users")
      .update({ workspace_id: workspaceId, role_id: membership.role_id })
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };

    await logAudit({ action: "user.switched_workspace", entityType: "workspace", entityId: workspaceId });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't switch workspace." };
  }
}

export interface CreateWorkspaceResult {
  ok: boolean;
  workspaceId?: string;
  error?: string;
}

/** Creates a brand-new workspace owned by the caller and switches into it immediately. */
export async function createWorkspace(name: string): Promise<CreateWorkspaceResult> {
  try {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: "Workspace name is required." };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated" };

    const admin = createAdminClient();
    const { data: ws, error: wsError } = await admin
      .from("workspaces")
      .insert({ name: trimmed, owner_id: user.id })
      .select("id")
      .single();
    if (wsError || !ws) return { ok: false, error: wsError?.message || "Couldn't create the workspace." };

    const { error: memberError } = await admin
      .from("workspace_members")
      .insert({ user_id: user.id, workspace_id: ws.id, role_id: 1 });
    if (memberError) return { ok: false, error: memberError.message };

    await logAudit({ action: "workspace.created", entityType: "workspace", entityId: ws.id, entityLabel: trimmed });

    const switched = await switchWorkspace(ws.id);
    if (!switched.ok) return { ok: false, error: switched.error };

    return { ok: true, workspaceId: ws.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't create the workspace." };
  }
}
