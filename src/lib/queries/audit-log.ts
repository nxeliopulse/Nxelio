"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/queries/auth-guards";

export interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Records one audit entry for the current user's action. Fire-and-forget from
 * the caller's perspective — never throws, so a logging failure can't break the
 * actual feature (creating a campaign still succeeds even if this fails).
 */
export async function logAudit(entry: {
  action: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("workspace_id, full_name, email")
      .eq("user_id", user.id)
      .single();
    if (!profile?.workspace_id) return;

    await admin.from("audit_log").insert({
      workspace_id: profile.workspace_id,
      actor_user_id: user.id,
      actor_name: profile.full_name || profile.email || "Unknown",
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      entity_label: entry.entityLabel ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    console.error("[audit-log] failed to record entry:", err);
  }
}

/** Super Admin only — the last 200 entries for the workspace, newest first. */
export async function getAuditLog(): Promise<AuditLogRow[]> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  return (data as AuditLogRow[]) || [];
}
