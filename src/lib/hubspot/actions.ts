"use server";
import { createClient } from "@/lib/supabase/server";
import { getLeadById } from "@/lib/queries/leads";
import { logAudit } from "@/lib/queries/audit-log";
import { revalidatePath } from "next/cache";
import { upsertContact } from "./client";
import { getWorkspaceHubspotToken } from "@/lib/queries/hubspot-accounts";

export interface SyncLeadToHubspotResult {
  ok: boolean;
  error?: string;
}

/** Pushes one lead to the current workspace's connected HubSpot account as a Contact. */
export async function syncLeadToHubspot(leadId: string): Promise<SyncLeadToHubspotResult> {
  const tokenResult = await getWorkspaceHubspotToken();
  if (!tokenResult.ok) return { ok: false, error: tokenResult.error };

  const lead = await getLeadById(leadId);
  if (!lead) return { ok: false, error: "Lead not found" };
  if (!lead.email) return { ok: false, error: "This lead has no email address — HubSpot contacts require one." };

  const result = await upsertContact(tokenResult.accessToken, {
    email: lead.email,
    firstName: lead.first_name || lead.full_name?.split(" ")[0],
    lastName: lead.last_name,
    company: lead.company_name,
    jobTitle: lead.job_title,
    phone: lead.phone,
    website: lead.website_url,
    city: lead.city,
    state: lead.state,
    country: lead.country,
    postalCode: lead.postal_code,
  });

  if (!result.ok) return { ok: false, error: result.error };

  const supabase = await createClient();
  await supabase
    .from("leads")
    .update({ hubspot_contact_id: result.contactId, hubspot_synced_at: new Date().toISOString() })
    .eq("id", leadId);

  await logAudit({
    action: "lead.hubspot_sync",
    entityType: "lead",
    entityId: leadId,
    entityLabel: lead.full_name || lead.email || undefined,
    metadata: { hubspot_contact_id: result.contactId },
  });
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}
