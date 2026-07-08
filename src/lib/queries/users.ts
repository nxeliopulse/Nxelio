"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
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

/** Ensure a target user belongs to the given workspace (prevents cross-tenant IDOR). */
async function assertTargetInWorkspace(targetUserId: string, workspaceId: string) {
  const admin = createAdminClient();
  const { data: target } = await admin
    .from("users")
    .select("workspace_id")
    .eq("user_id", targetUserId)
    .single();
  if (!target || target.workspace_id !== workspaceId) {
    throw new Error("Forbidden: user is outside your workspace");
  }
}

export async function getUsers(): Promise<UserWithRole[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select(`*, roles(role_name)`)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getUsers error:", error.message);
    return [];
  }
  if (!data) return [];

  // Build manager_name lookup from same data
  const byId = new Map(data.map((u) => [u.user_id, u.full_name as string]));

  return data.map((u) => {
    const row = u as typeof u & { roles?: { role_name?: string } };
    return {
      ...u,
      role_name: row.roles?.role_name || "—",
      manager_name: u.manager_id ? byId.get(u.manager_id) || null : null,
    };
  });
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

export async function updateUserStatus(userId: string, status: string) {
  const supabase = await createClient();
  await supabase.from("users").update({ status }).eq("user_id", userId);
  revalidatePath("/users");
}

export async function updateUserRole(userId: string, roleId: number, managerId: string | null) {
  const supabase = await createClient();
  await supabase.from("users").update({ role_id: roleId, manager_id: managerId }).eq("user_id", userId);
  revalidatePath("/users");
}

export async function upsertPermission(userId: string, menuId: number, perms: { can_view?: boolean; can_create?: boolean; can_edit?: boolean; can_delete?: boolean; can_upload?: boolean }) {
  const supabase = await createClient();
  await supabase.from("user_permissions").upsert(
    { user_id: userId, menu_id: menuId, ...perms },
    { onConflict: "user_id,menu_id" }
  );
  revalidatePath("/users");
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

export async function inviteUser(email: string, fullName: string, roleId: number, _managerId: string | null) {
  void _managerId;
  const admin = createAdminClient();

  // 1. Only a Super Admin may invite users; scope to their workspace.
  const { workspaceId: inviterWorkspaceId } = await requireSuperAdmin();

  // Only allow assigning one of the known roles (1 Super, 2 Marketing, 3 Sales)
  if (![1, 2, 3].includes(roleId)) throw new Error("Invalid role");

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
  if (upsertError) throw upsertError;

  // 5. Delete orphan workspace that the signup trigger may have created
  await admin
    .from("workspaces")
    .delete()
    .eq("owner_id", created.id)
    .neq("id", inviterWorkspaceId);

  revalidatePath("/users");
  return { user: { id: created.id, email }, tempPassword };
}

export async function deleteUser(userId: string) {
  const { userId: callerId, workspaceId } = await requireSuperAdmin();
  if (userId === callerId) throw new Error("You cannot delete your own account");
  await assertTargetInWorkspace(userId, workspaceId);

  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
  revalidatePath("/users");
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
