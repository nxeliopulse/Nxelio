"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { LeadArchiveRow } from "@/lib/queries/lead-import-archive";

// Sole allowed identity for the standalone platform admin panel (/admin) —
// intentionally NOT the same thing as a workspace's in-app Super Admin role.
// This account can see the lead-import archive across every workspace.
// Not exported — a "use server" file can only export async functions, so
// other modules needing to confirm/reuse this identity (e.g.
// feature-kill-switches.ts's password re-verification) call isPlatformAdmin()
// and read the session's own email instead of importing this constant.
const PLATFORM_ADMIN_EMAIL = "admin@nxelio.com";

export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return Boolean(user?.email && user.email.toLowerCase() === PLATFORM_ADMIN_EMAIL);
}

export async function platformAdminSignOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

/** Resolves the platform admin's own workspace — treated as the one "company
 *  account" for features that need a single fixed workspace regardless of
 *  which customer/session is calling (e.g. auto-generating a Google Meet
 *  link for a cancellation request using our shared calendar connection,
 *  not the customer's). Returns null if the admin login has no workspace. */
export async function getPlatformAdminWorkspaceId(): Promise<string | null> {
  const admin = createAdminClient();
  const { data: userList, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return null;
  const adminUser = userList.users.find((u) => (u.email || "").toLowerCase() === PLATFORM_ADMIN_EMAIL);
  if (!adminUser) return null;

  const { data: row } = await admin.from("users").select("workspace_id").eq("user_id", adminUser.id).single();
  return row?.workspace_id ?? null;
}

/** Cross-workspace lead-import archive — platform admin only, bypasses per-workspace RLS by design. */
export async function getPlatformLeadArchive(): Promise<(LeadArchiveRow & { workspace_name: string | null })[]> {
  if (!(await isPlatformAdmin())) throw new Error("Forbidden");
  const admin = createAdminClient();
  const { data } = await admin
    .from("lead_import_archive")
    .select("*, workspaces(name)")
    .order("imported_at", { ascending: false })
    .limit(1000);
  return ((data as unknown as Array<LeadArchiveRow & { workspaces: { name: string } | null }>) || []).map((r) => ({
    ...r,
    workspace_name: r.workspaces?.name ?? null,
  }));
}
