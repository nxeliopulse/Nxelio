"use server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/queries/audit-log";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { revalidatePath } from "next/cache";
import { getLeadDetail } from "@/lib/queries/lead-detail";
import { findMatchingAccount, createAccount, getAccountById, type AccountRow } from "@/lib/queries/accounts";
import { findMatchingContact, createContact, type ContactRow } from "@/lib/queries/contacts";
import { updateLead } from "@/lib/queries/leads";

/** Auto-matches an in-progress lead against existing Accounts/Contacts, for the Convert Lead modal's pre-fill. */
export async function getConversionMatches(leadId: string): Promise<{ account: AccountRow | null; contact: ContactRow | null }> {
  const { lead } = await getLeadDetail(leadId);
  if (!lead) return { account: null, contact: null };

  // Company-wise Buy Leads already resolved/created the right Account up
  // front (discovered_account_id) — use that directly instead of re-matching
  // by name/website, which could theoretically land on a different account
  // than the one this lead was actually sourced from.
  const discoveredAccountId = (lead as { discovered_account_id?: string | null }).discovered_account_id;
  const [account, contact] = await Promise.all([
    discoveredAccountId ? getAccountById(discoveredAccountId) : findMatchingAccount({ companyName: lead.company_name, website: lead.website_url }),
    findMatchingContact({ email: lead.email, phone: lead.phone, linkedin: lead.linkedin }),
  ]);
  return { account, contact };
}

export interface ConvertLeadInput {
  leadId: string;
  account: { mode: "existing"; id: string } | { mode: "new"; payload: Partial<AccountRow> };
  contact: { mode: "existing"; id: string } | { mode: "new"; payload: Partial<ContactRow> };
}

export interface ConvertLeadResult {
  accountId: string;
  contactId: string;
}

/**
 * Converts a Lead into a real Account + Contact (created or matched to an
 * existing one). The Lead itself is never deleted — it's marked Converted
 * and keeps permanent links to whatever it became, so "View Account/Contact"
 * always has somewhere to go. Opportunities are intentionally NOT created
 * here — only an Account (Company) can be turned into an Opportunity, from
 * the Account page's "Add Deal" flow (see opportunities.ts createOpportunityFromAccount).
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
  const [{ data: account }] = await Promise.all([
    supabase.from("accounts").select("account_name").eq("id", accountId).single(),
  ]);

  // 3. Mark the lead Converted and permanently link it to what it became.
  // allowConvertedStatus: this is the one legitimate place status: "Converted"
  // may be set — every other caller (edit modal, AI tool, etc.) is blocked
  // from setting it manually, since that would fake a conversion with no
  // Account/Contact ever actually created (see status-flow.ts). Opportunities
  // are never created here — only an Account (Company) can become one.
  await updateLead(input.leadId, {
    status: "Converted",
    converted_account_id: accountId,
    converted_contact_id: contactId,
  }, { allowConvertedStatus: true });

  await supabase.from("lead_activities").insert({
    lead_id: input.leadId,
    activity_type: "CONVERTED",
    metadata: { account_id: accountId, contact_id: contactId },
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
  await logAudit({
    action: "lead.converted",
    entityType: "lead",
    entityId: input.leadId,
    metadata: { accountId, contactId },
  });

  return { accountId, contactId };
}
