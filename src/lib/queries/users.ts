"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/queries/audit-log";
import { revalidatePath } from "next/cache";

export interface UserRow {
  user_id: string;
  full_name: string;
  email: string;
  role_id: number | null;
  manager_id: string | null;
  status: string;
  last_login: string | null;
  nav_access?: Record<string, boolean> | null;
  created_at: string;
  updated_at: string;
}

export interface UserWithRole extends UserRow {
  role_name: string;
  manager_name: string | null;
}

/**
 * Authorization guard for privileged user-management actions.
 * Verifies the caller is authenticated AND a Super Admin (role_id = 1),
 * and returns their identity + workspace so callers can scope by workspace.
 * Throws if the caller is not allowed — never rely on UI hiding alone.
 */
async function requireSuperAdmin(): Promise<{ userId: string; workspaceId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Use the admin client so a restrictive RLS policy can't mask the caller's
  // own role row; we are reading the caller's own record by their auth uid.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("role_id, workspace_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.workspace_id) throw new Error("No workspace");
  if (profile.role_id !== 1) throw new Error("Forbidden: Super Admin only");
  return { userId: user.id, workspaceId: profile.workspace_id as string };
}

/**
 * Ensure a target user is a member of the given workspace (prevents
 * cross-tenant IDOR). Checked against workspace_members — NOT users.workspace_id
 * — since a login can now be a member of several workspaces and only one of
 * them is their "currently active" one at any moment.
 */
async function assertTargetInWorkspace(targetUserId: string, workspaceId: string) {
  const admin = createAdminClient();
  const { data: target } = await admin
    .from("workspace_members")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!target) {
    throw new Error("Forbidden: user is outside your workspace");
  }
}

/**
 * The /users page roster — sourced from workspace_members (not users.workspace_id
 * directly), so a member currently "active" in a different workspace right now
 * still correctly appears on this workspace's team list with their role/status
 * IN THIS workspace.
 */
export async function getUsers(): Promise<UserWithRole[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: me } = await supabase.from("users").select("workspace_id").eq("user_id", user.id).single();
  const workspaceId = me?.workspace_id;
  if (!workspaceId) return [];

  const { data, error } = await supabase
    .from("workspace_members")
    .select("role_id, status, users(*), roles(role_name)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getUsers error:", error.message);
    return [];
  }
  if (!data) return [];

  const rows: Array<Omit<UserWithRole, "manager_name">> = [];
  for (const m of data) {
    const u = m.users as unknown as UserRow | null;
    if (!u) continue;
    const roleRow = m.roles as unknown as { role_name?: string } | null;
    // role_id/status shown here are membership-scoped (this workspace),
    // not the global users.role_id/status, which may reflect another
    // workspace this same login is currently active in.
    rows.push({ ...u, role_id: m.role_id as number, status: m.status as string, role_name: roleRow?.role_name || "—" });
  }

  const byId = new Map(rows.map((u) => [u.user_id, u.full_name]));

  return rows.map((u) => ({
    ...u,
    manager_name: u.manager_id ? byId.get(u.manager_id) || null : null,
  }));
}

export async function getCurrentUserProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("*, roles(role_name)")
    .eq("user_id", user.id)
    .single();
  return data;
}

export async function getRoles() {
  const supabase = await createClient();
  const { data } = await supabase.from("roles").select("*").order("role_id");
  return data || [];
}

export async function getMenus() {
  const supabase = await createClient();
  const { data } = await supabase.from("menus").select("*").order("menu_id");
  return data || [];
}

export async function getUserPermissions(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_permissions")
    .select("*, menus(menu_name)")
    .eq("user_id", userId);
  return data || [];
}

/**
 * Toggles a member's access to THIS workspace (not a global account suspend —
 * they may still be active in other workspaces). Written on workspace_members,
 * which has no client-facing write policy, so this always goes through the
 * admin client.
 */
export async function updateUserStatus(userId: string, status: string) {
  const { workspaceId } = await requireSuperAdmin();
  await assertTargetInWorkspace(userId, workspaceId);
  const admin = createAdminClient();
  await admin.from("workspace_members").update({ status }).eq("user_id", userId).eq("workspace_id", workspaceId);
  revalidatePath("/users");
  await logAudit({ action: "user.status_updated", entityType: "user", entityId: userId, metadata: { status, workspaceId } });
}

export async function updateUserRole(userId: string, roleId: number, managerId: string | null) {
  const { userId: callerId, workspaceId } = await requireSuperAdmin();
  await assertTargetInWorkspace(userId, workspaceId);
  // A Super Admin can't strip their OWN super-admin role (avoids locking the
  // workspace out of admin access by accident).
  if (userId === callerId && roleId !== 1) throw new Error("You can't change your own role.");
  // Exactly one Super Admin per workspace — its creator. Nobody else may be
  // promoted into it after the fact.
  if (roleId === 1 && userId !== callerId) throw new Error("Only the workspace creator can be Super Admin.");

  const admin = createAdminClient();
  // Role is membership-scoped (this workspace) — write it there.
  await admin.from("workspace_members").update({ role_id: roleId }).eq("user_id", userId).eq("workspace_id", workspaceId);

  // manager_id stays a global (not per-workspace) field on users for now.
  // Also sync users.role_id when the target is currently ACTIVE in this exact
  // workspace, so their live session's permissions update immediately (the
  // same "copy onto the active pointer" mechanism transferUserToWorkspace() uses).
  const { data: target } = await admin.from("users").select("workspace_id").eq("user_id", userId).single();
  const patch: Record<string, unknown> = { manager_id: managerId };
  if (target?.workspace_id === workspaceId) patch.role_id = roleId;
  await admin.from("users").update(patch).eq("user_id", userId);

  revalidatePath("/users");
  await logAudit({ action: "user.role_updated", entityType: "user", entityId: userId, metadata: { roleId, managerId, workspaceId } });
}

export async function upsertPermission(userId: string, menuId: number, perms: { can_view?: boolean; can_create?: boolean; can_edit?: boolean; can_delete?: boolean; can_upload?: boolean }) {
  const { workspaceId } = await requireSuperAdmin();
  await assertTargetInWorkspace(userId, workspaceId);
  const supabase = await createClient();
  await supabase.from("user_permissions").upsert(
    { user_id: userId, menu_id: menuId, ...perms },
    { onConflict: "user_id,menu_id" }
  );
  revalidatePath("/users");
  await logAudit({ action: "user.permission_updated", entityType: "user", entityId: userId, metadata: { menuId, ...perms } });
}

function generateTempPassword(): string {
  // Temp + 10 alphanumerics + special + uppercase (always 16 chars)
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let rnd = "";
  for (let i = 0; i < 10; i++) rnd += chars[Math.floor(Math.random() * chars.length)];
  return `Temp${rnd}!A`;
}

/** Calls Supabase auth admin REST API directly — bypasses SDK quirks */
async function adminCreateAuthUser(email: string, password: string, fullName: string): Promise<{ id: string }> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName } }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.msg || body.error_description || `createUser failed (${res.status})`);
  return { id: body.id };
}

async function adminUpdateAuthPassword(userId: string, password: string): Promise<void> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.msg || body.error_description || `updatePassword failed (${res.status})`);
  }
}

export interface InviteUserResult {
  ok: boolean;
  user?: { id: string; email: string };
  tempPassword?: string;
  existingUser?: boolean;
  error?: string;
}

/**
 * Next.js redacts thrown Server Action errors in production builds down to a
 * generic "error occurred in Server Components render" message — so real,
 * actionable errors (like "this email is already registered elsewhere") never
 * reach the admin. Everything below is caught and returned as plain data
 * instead of thrown, so the real message actually shows up in the UI.
 */
export async function inviteUser(email: string, fullName: string, roleId: number, _managerId: string | null): Promise<InviteUserResult> {
  void _managerId;
  try {
    const admin = createAdminClient();

    // 1. Only a Super Admin may invite users; scope to their workspace.
    const { workspaceId: inviterWorkspaceId } = await requireSuperAdmin();

    // Only allow assigning a role that actually exists (was hardcoded to [1,2,3],
    // which silently rejected any role added later, e.g. Reviewer).
    const { data: role } = await admin.from("roles").select("role_id").eq("role_id", roleId).single();
    if (!role) return { ok: false, error: "Invalid role" };

    // Exactly one Super Admin per workspace — its creator, set at signup.
    // Nobody else may be granted it, invite or otherwise.
    if (roleId === 1) return { ok: false, error: "Only the workspace creator can be Super Admin. Choose a different role." };

    // Supabase Auth requires every email to be globally unique across the whole
    // project, but that's an auth-identity constraint, not a workspace one — a
    // login can be a member of several workspaces. If this email already has an
    // account, add them to THIS workspace instead of creating a duplicate login.
    const { data: existing } = await admin.from("users").select("user_id").eq("email", email).maybeSingle();
    if (existing) {
      const { data: alreadyMember } = await admin
        .from("workspace_members")
        .select("id")
        .eq("user_id", existing.user_id)
        .eq("workspace_id", inviterWorkspaceId)
        .maybeSingle();
      if (alreadyMember) {
        return { ok: false, error: "This person is already a member of this workspace." };
      }
      const { error: memberError } = await admin
        .from("workspace_members")
        .insert({ user_id: existing.user_id, workspace_id: inviterWorkspaceId, role_id: roleId });
      if (memberError) return { ok: false, error: memberError.message };

      revalidatePath("/users");
      await logAudit({ action: "user.invited_existing", entityType: "user", entityId: existing.user_id, entityLabel: email, metadata: { roleId, workspaceId: inviterWorkspaceId } });
      return { ok: true, user: { id: existing.user_id, email }, existingUser: true };
    }

    // 2. Create the auth user via direct REST API (guarantees password is set)
    const tempPassword = generateTempPassword();
    const created = await adminCreateAuthUser(email, tempPassword, fullName);

    // 3. Defensively re-set the password right after — guarantees it sticks
    //    even if any trigger somehow interfered with the create flow
    await adminUpdateAuthPassword(created.id, tempPassword);

    // 4. Upsert public.users into the inviter's workspace
    const { error: upsertError } = await admin.from("users").upsert(
      {
        user_id: created.id,
        full_name: fullName,
        email,
        role_id: roleId,
        status: "ACTIVE",
        workspace_id: inviterWorkspaceId,
      },
      { onConflict: "user_id" }
    );
    if (upsertError) return { ok: false, error: upsertError.message };

    // 4b. Their first/active workspace membership.
    const { error: memberError } = await admin
      .from("workspace_members")
      .insert({ user_id: created.id, workspace_id: inviterWorkspaceId, role_id: roleId });
    if (memberError) return { ok: false, error: memberError.message };

    // 5. Delete orphan workspace that the signup trigger may have created
    await admin
      .from("workspaces")
      .delete()
      .eq("owner_id", created.id)
      .neq("id", inviterWorkspaceId);

    revalidatePath("/users");
    await logAudit({ action: "user.invited", entityType: "user", entityId: created.id, entityLabel: email, metadata: { roleId } });
    return { ok: true, user: { id: created.id, email }, tempPassword };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't create the user." };
  }
}

export interface TransferWorkspaceResult {
  ok: boolean;
  error?: string;
}

/**
 * Moves a user to a different workspace. Admin-only — under the
 * one-workspace-per-user model there is no self-service switch/create, so
 * this is the only way a login's workspace ever changes after signup. The
 * user's existing leads/campaigns/etc. stay behind in their old workspace;
 * they start clean in the new one (workspace_id is the only thing tenant
 * tables are scoped by, so nothing needs to be re-tagged).
 */
export async function transferUserToWorkspace(userId: string, newWorkspaceId: string): Promise<TransferWorkspaceResult> {
  try {
    const { workspaceId: callerWorkspaceId } = await requireSuperAdmin();
    await assertTargetInWorkspace(userId, callerWorkspaceId);
    if (newWorkspaceId === callerWorkspaceId) return { ok: false, error: "That user is already in this workspace." };

    const admin = createAdminClient();

    const { data: newWorkspace } = await admin.from("workspaces").select("id").eq("id", newWorkspaceId).maybeSingle();
    if (!newWorkspace) return { ok: false, error: "That workspace doesn't exist." };

    const { data: targetUser } = await admin.from("users").select("role_id").eq("user_id", userId).single();
    const roleId = targetUser?.role_id ?? 1;

    const { error: updateError } = await admin.from("users").update({ workspace_id: newWorkspaceId }).eq("user_id", userId);
    if (updateError) return { ok: false, error: updateError.message };

    // The old membership is no longer active; the new one becomes the user's
    // single active workspace membership.
    await admin
      .from("workspace_members")
      .update({ status: "REMOVED" })
      .eq("user_id", userId)
      .eq("workspace_id", callerWorkspaceId);

    const { error: memberError } = await admin
      .from("workspace_members")
      .upsert({ user_id: userId, workspace_id: newWorkspaceId, role_id: roleId, status: "ACTIVE" }, { onConflict: "user_id,workspace_id" });
    if (memberError) return { ok: false, error: memberError.message };

    revalidatePath("/users");
    await logAudit({
      action: "user.transferred_workspace",
      entityType: "user",
      entityId: userId,
      metadata: { fromWorkspaceId: callerWorkspaceId, toWorkspaceId: newWorkspaceId },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't transfer the user." };
  }
}

export async function deleteUser(userId: string) {
  const { userId: callerId, workspaceId } = await requireSuperAdmin();
  if (userId === callerId) throw new Error("You cannot delete your own account");
  await assertTargetInWorkspace(userId, workspaceId);

  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
  revalidatePath("/users");
  await logAudit({ action: "user.deleted", entityType: "user", entityId: userId });
}

/**
 * Save per-user nav access overrides. Pass an object where each key is the
 * nav href and the value is true (allow) or false (deny). Keys not present
 * fall back to the user's role default.
 */
export async function updateUserNavAccess(userId: string, navAccess: Record<string, boolean>) {
  const { workspaceId } = await requireSuperAdmin();
  await assertTargetInWorkspace(userId, workspaceId);

  const admin = createAdminClient();
  const { error } = await admin.from("users").update({ nav_access: navAccess }).eq("user_id", userId);
  if (error) throw error;
  revalidatePath("/users");
  revalidatePath("/", "layout");
  await logAudit({ action: "user.nav_access_updated", entityType: "user", entityId: userId, metadata: navAccess });
}

/**
 * Resets the user's password to a freshly-generated temp password and returns it.
 * Uses the direct REST API for the same reliability as inviteUser.
 */
export async function resetUserPassword(userId: string): Promise<{ tempPassword: string }> {
  const { workspaceId } = await requireSuperAdmin();
  await assertTargetInWorkspace(userId, workspaceId);

  const tempPassword = generateTempPassword();
  await adminUpdateAuthPassword(userId, tempPassword);
  await logAudit({ action: "user.password_reset", entityType: "user", entityId: userId });
  return { tempPassword };
}

/** Fetch the user's auth metadata (last sign-in, email confirmed, etc.) */
export async function getUserAuthInfo(userId: string): Promise<{ last_sign_in_at: string | null; email_confirmed_at: string | null } | null> {
  const { workspaceId } = await requireSuperAdmin();
  await assertTargetInWorkspace(userId, workspaceId);

  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
  });
  if (!res.ok) return null;
  const u = await res.json();
  return {
    last_sign_in_at: u.last_sign_in_at ?? null,
    email_confirmed_at: u.email_confirmed_at ?? null,
  };
}
