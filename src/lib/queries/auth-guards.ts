"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * Throws unless the caller is authenticated AND a Super Admin (role_id = 1).
 * Never rely on UI hiding alone — this is the actual enforcement point for
 * privileged actions like connecting/disconnecting a mailbox, LinkedIn, or
 * calendar account.
 */
export async function requireSuperAdmin(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Admin client so a restrictive RLS policy can't mask the caller's own role row.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("role_id")
    .eq("user_id", user.id)
    .single();

  if (profile?.role_id !== 1) throw new Error("Forbidden: only a Super Admin can manage connectors.");
}

/** Non-throwing check for gating UI (still relies on the server-side guard for real enforcement). */
export async function isSuperAdmin(): Promise<boolean> {
  try {
    await requireSuperAdmin();
    return true;
  } catch {
    return false;
  }
}
