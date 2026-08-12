"use server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/queries/audit-log";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { revalidatePath } from "next/cache";
import { getLeadDetail } from "@/lib/queries/lead-detail";
import { findMatchingAccount, createAccount, type AccountRow } from "@/lib/queries/accounts";
import { findMatchingContact, createContact, type ContactRow } from "@/lib/queries/contacts";
import { updateLead } from "@/lib/queries/leads";
import type { OpportunityStage } from "@/lib/opportunities";

/** Auto-matches an in-progress lead against existing Accounts/Contacts, for the Convert Lead modal's pre-fill. */
export async function getConversionMatches(leadId: string): Promise<{ account: AccountRow | null; contact: ContactRow | null }> {
  const { lead } = await getLeadDetail(leadId);
  if (!lead) return { account: null, contact: null };

  const [account, contact] = await Promise.all([
    findMatchingAccount({ companyName: lead.company_name, website: lead.website_url }),
    findMatchingContact({ email: lead.email, phone: lead.phone, linkedin: lead.linkedin }),
  ]);
  return { account, contact };
}

export interface ConvertLeadInput {
  leadId: string;
  account: { mode: "existing"; id: string } | { mode: "new"; payload: Partial<AccountRow> };
  contact: { mode: "existing"; id: string } | { mode: "new"; payload: Partial<ContactRow> };
  opportunity: null | { name: string; stage: OpportunityStage; dealValue: number; expectedCloseDate: string | null };
}

export interface ConvertLeadResult {
  accountId: string;
  contactId: string;
  opportunityId: string | null;
}

/**
 * Converts a Lead into a real Account + Contact (created or matched to an
 * existing one) and an optional Opportunity. The Lead itself is never
 * deleted — it's marked Converted and keeps permanent links to whatever it
 * became, so "View Account/Contact/Opportunity" always has somewhere to go.
 */
export async function convertLead(input: ConvertLeadInput): Promise<ConvertLeadResult> {
  const { lead } = await getLeadDetail(input.leadId);
  if (!lead) throw new Error("Lead not found");

  // 1. Resolve or create the Account.
  const accountId =
    input.account.mode === "existing"
      ? input.account.id
      : (await createAccount(input.account.payload)).id;

  // 2. Resolve or create the Contact, linked to the resolved Account.
  let contactId: string;
  if (input.contact.mode === "existing") {
    contactId = input.contact.id;
  } else {
    const created = await createContact({ ...input.contact.payload, account_id: input.contact.payload.account_id ?? accountId });
    contactId = created.id;
  }

  const supabase = await createClient();
  const [{ data: account }, { data: contact }] = await Promise.all([
    supabase.from("accounts").select("account_name").eq("id", accountId).single(),
    supabase.from("contacts").select("first_name, last_name, email").eq("id", contactId).single(),
  ]);

  // 3. Optionally create the Opportunity, linked to both.
  let opportunityId: string | null = null;
  if (input.opportunity) {
    const { data: user } = await supabase.auth.getUser();
    const { data: opp, error: oppError } = await supabase
      .from("opportunities")
      .insert({
        lead_id: input.leadId,
        account_id: accountId,
        contact_id: contactId,
        name: input.opportunity.name,
        company: account?.account_name ?? null,
        contact_name: contact ? `${contact.first_name} ${contact.last_name}`.trim() : null,
        contact_email: contact?.email ?? null,
        deal_value: input.opportunity.dealValue || 0,
        stage: input.opportunity.stage,
        expected_close_date: input.opportunity.expectedCloseDate,
        owner_id: user.user?.id ?? null,
      })
      .select("id")
      .single();
    if (oppError) throw oppError;
    opportunityId = opp.id;
  }

  // 4. Mark the lead Converted and permanently link it to what it became.
  // allowConvertedStatus: this is the one legitimate place status: "Converted"
  // may be set — every other caller (edit modal, AI tool, etc.) is blocked
  // from setting it manually, since that would fake a conversion with no
  // Account/Contact/Opportunity ever actually created (see status-flow.ts).
  await updateLead(input.leadId, {
    status: "Converted",
    converted_account_id: accountId,
    converted_contact_id: contactId,
    converted_opportunity_id: opportunityId,
  }, { allowConvertedStatus: true });

  await supabase.from("lead_activities").insert({
    lead_id: input.leadId,
    activity_type: "CONVERTED_TO_OPPORTUNITY",
    metadata: { account_id: accountId, contact_id: contactId, opportunity_id: opportunityId },
  });

  await notifyCurrentUser({
    type: "lead",
    title: "Lead converted",
    message: account?.account_name ? `${lead.full_name || "Lead"} → ${account.account_name}` : lead.full_name || "Lead converted",
    link: `/leads/${input.leadId}`,
  });

  revalidatePath(`/leads/${input.leadId}`);
  revalidatePath("/accounts");
  revalidatePath("/contacts");
  revalidatePath("/opportunities");
  await logAudit({
    action: "lead.converted",
    entityType: "lead",
    entityId: input.leadId,
    metadata: { accountId, contactId, opportunityId },
  });

  return { accountId, contactId, opportunityId };
}
