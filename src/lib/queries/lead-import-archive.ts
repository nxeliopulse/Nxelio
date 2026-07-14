"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { LeadRow } from "@/lib/queries/leads";

export interface LeadArchiveRow {
  id: string;
  workspace_id: string;
  imported_by_name: string | null;
  source: string | null;
  original_lead_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  industry: string | null;
  linkedin: string | null;
  website_url: string | null;
  imported_at: string;
  deleted_from_leads_at: string | null;
}

/**
 * Permanently archives leads at the moment they're imported (CSV, LinkedIn
 * search, Buy Leads, etc.). Never throws — archiving failure shouldn't break
 * the actual import, which is why this uses the admin client and swallows
 * errors after logging them.
 */
export async function archiveImportedLeads(
  leads: Array<Partial<LeadRow> & { id?: string }>,
  source: string
): Promise<void> {
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

    const rows = leads.map((l) => ({
      workspace_id: profile.workspace_id,
      imported_by_user_id: user.id,
      imported_by_name: profile.full_name || profile.email || "Unknown",
      source,
      original_lead_id: l.id ?? null,
      full_name: l.full_name ?? null,
      email: l.email ?? null,
      phone: l.phone ?? null,
      company_name: l.company_name ?? null,
      industry: l.industry ?? null,
      linkedin: l.linkedin ?? null,
      website_url: l.website_url ?? null,
    }));
    if (rows.length) await admin.from("lead_import_archive").insert(rows);
  } catch (err) {
    console.error("[lead-import-archive] failed to archive:", err);
  }
}

/** Stamps archive rows as deleted-from-leads without removing them — the archive itself is permanent. */
export async function markArchivedLeadsDeleted(leadIds: string[]): Promise<void> {
  if (!leadIds.length) return;
  try {
    const admin = createAdminClient();
    await admin
      .from("lead_import_archive")
      .update({ deleted_from_leads_at: new Date().toISOString() })
      .in("original_lead_id", leadIds)
      .is("deleted_from_leads_at", null);
  } catch (err) {
    console.error("[lead-import-archive] failed to stamp deletion:", err);
  }
}

/** Super Admin only, workspace-scoped — the full import archive, newest first. */
export async function getLeadImportArchive(): Promise<LeadArchiveRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lead_import_archive")
    .select("*")
    .order("imported_at", { ascending: false })
    .limit(500);
  return (data as LeadArchiveRow[]) || [];
}
