"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getOpportunitiesForLead } from "@/lib/queries/opportunities";
import { getMeetingsForLead } from "@/lib/queries/meetings";
import { getLeadNotes } from "@/lib/queries/lead-notes";
import { getCampaignsForLead } from "@/lib/queries/campaigns";

/** Never surface the underlying data-provider's name in the product — covers
 *  leads sourced before the display label was renamed too. */
function brandSource(source: string | null): string | null {
  return source ? source.replace(/bright\s*data/gi, "BILEADS Kit") : source;
}

export interface LeadHistory {
  createdByName: string | null;
  createdAt: string;
  lastModifiedByName: string | null;
  lastModifiedAt: string;
  source: string | null;
}

/**
 * "Created By" comes straight from leads.owner_id (auto-filled to the
 * inserting user by the trg_set_lead_owner trigger) + created_at.
 * "Last Modified By" comes from the existing audit_log — updateLead() already
 * records a "lead.updated" entry with the acting user's name every time a
 * lead is edited, so no new tracking column is needed. Falls back to the
 * creation info when the lead has never been edited since.
 */
export async function getLeadHistory(leadId: string): Promise<LeadHistory | null> {
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("owner_id, created_at, updated_at, source, workspace_id")
    .eq("id", leadId)
    .single();
  if (!lead) return null;

  const admin = createAdminClient();
  const [{ data: owner }, { data: lastEdit }] = await Promise.all([
    lead.owner_id
      ? admin.from("users").select("full_name, email").eq("user_id", lead.owner_id).maybeSingle()
      : Promise.resolve({ data: null }),
    lead.workspace_id
      ? admin
          .from("audit_log")
          .select("actor_name, created_at")
          .eq("workspace_id", lead.workspace_id)
          .eq("entity_type", "lead")
          .eq("entity_id", leadId)
          .eq("action", "lead.updated")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const ownerName = (owner as { full_name?: string | null; email?: string | null } | null)?.full_name
    || (owner as { full_name?: string | null; email?: string | null } | null)?.email
    || null;
  const lastEditRow = lastEdit as { actor_name?: string | null; created_at?: string } | null;

  return {
    createdByName: ownerName,
    createdAt: lead.created_at,
    lastModifiedByName: lastEditRow?.actor_name || ownerName,
    lastModifiedAt: lastEditRow?.created_at || lead.updated_at,
    source: brandSource(lead.source),
  };
}

export async function getLeadDetail(id: string) {
  const supabase = await createClient();
  const [{ data: lead }, { data: activities }, { data: messages }, opportunities, meetings, history, notes, campaigns] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).single(),
    supabase.from("lead_activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("inbox_messages").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(10),
    getOpportunitiesForLead(id),
    getMeetingsForLead(id),
    getLeadHistory(id),
    getLeadNotes(id),
    getCampaignsForLead(id),
  ]);
  return { lead, activities: activities || [], messages: messages || [], opportunities, meetings, history, notes, campaigns };
}
