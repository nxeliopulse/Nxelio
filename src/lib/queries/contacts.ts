"use server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/queries/audit-log";
import { revalidatePath } from "next/cache";
import { isValidPhoneNumber } from "libphonenumber-js";
import { isValidLinkedIn, LINKEDIN_ERROR } from "@/lib/validation";

const PHONE_FIELD_LABELS: Record<string, string> = {
  phone: "Phone", mobile: "Mobile", home_phone: "Home phone", other_phone: "Other phone",
  assistant_phone: "Assistant phone", fax: "Fax", whatsapp: "WhatsApp",
};

/**
 * The client always sends these pre-formatted to international form (e.g.
 * "+1 555 123 4567") via formatPhoneForStorage() — that's self-describing, so
 * no country needs to be passed here. Never trust the client alone though:
 * reject anything that doesn't actually parse (mirrors accounts.ts's check).
 */
function assertValidContactPhoneFields(payload: Partial<ContactRow>) {
  for (const field of Object.keys(PHONE_FIELD_LABELS) as (keyof typeof PHONE_FIELD_LABELS)[]) {
    const value = payload[field as keyof ContactRow] as string | null | undefined;
    if (value && !isValidPhoneNumber(value)) {
      throw new Error(`${PHONE_FIELD_LABELS[field]} number isn't valid.`);
    }
  }
}

/** Never trust the client alone — reject anything that isn't a real
 *  linkedin.com URL, same enforcement point as the phone check above. */
function assertValidContactLinkedIn(payload: Partial<ContactRow>) {
  if (payload.linkedin && !isValidLinkedIn(payload.linkedin)) {
    throw new Error(LINKEDIN_ERROR);
  }
}

export interface ContactRow {
  id: string;
  account_id: string | null;
  contact_owner: string | null;
  salutation: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  home_phone: string | null;
  other_phone: string | null;
  assistant_name: string | null;
  assistant_phone: string | null;
  department: string | null;
  job_title: string | null;
  reporting_to_id: string | null;
  lead_source: string | null;
  date_of_birth: string | null;
  mailing_street: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_country: string | null;
  mailing_zip: string | null;
  other_street: string | null;
  other_city: string | null;
  other_state: string | null;
  other_country: string | null;
  other_zip: string | null;
  fax: string | null;
  email_opt_out: boolean;
  skype_id: string | null;
  secondary_email: string | null;
  twitter: string | null;
  linkedin: string | null;
  facebook: string | null;
  whatsapp: string | null;
  instagram: string | null;
  youtube: string | null;
  pinterest: string | null;
  description: string | null;
  photo_url: string | null;
  tags: string | null;
  rating: number | null;
  industry: string | null;
  language: string | null;
  currency: string | null;
  visibility: "public" | "private" | "select_people";
  visible_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactWithAccount extends ContactRow {
  account: { id: string; account_name: string; website: string | null } | null;
}

export async function getContactsCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("contacts").select("id", { count: "exact", head: true });
  return count ?? 0;
}

export async function getContacts(): Promise<ContactRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getContacts error:", error.message, error.details, error.hint, error.code);
    return [];
  }
  return data ?? [];
}

export async function getContactById(id: string): Promise<ContactWithAccount | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("*, account:accounts(id, account_name, website)")
    .eq("id", id)
    .single();
  return data as ContactWithAccount | null;
}

/**
 * Finds an existing Contact that plausibly matches a lead being converted —
 * by email first, then phone, then LinkedIn. Used to offer "Use existing
 * Contact" in the Convert Lead modal instead of creating a duplicate.
 */
export async function findMatchingContact({ email, phone, linkedin }: { email?: string | null; phone?: string | null; linkedin?: string | null }): Promise<ContactRow | null> {
  const supabase = await createClient();

  if (email?.trim()) {
    const { data } = await supabase.from("contacts").select("*").ilike("email", email.trim()).limit(1).maybeSingle();
    if (data) return data;
  }
  if (phone?.trim()) {
    const { data } = await supabase.from("contacts").select("*").eq("phone", phone.trim()).limit(1).maybeSingle();
    if (data) return data;
  }
  if (linkedin?.trim()) {
    const { data } = await supabase.from("contacts").select("*").ilike("linkedin", `%${linkedin.trim()}%`).limit(1).maybeSingle();
    if (data) return data;
  }
  return null;
}

export async function createContact(payload: Partial<ContactRow>) {
  assertValidContactPhoneFields(payload);
  assertValidContactLinkedIn(payload);
  const supabase = await createClient();
  const { data, error } = await supabase.from("contacts").insert(payload).select().single();
  if (error) throw error;
  revalidatePath("/contacts");
  if (payload.account_id) revalidatePath(`/accounts/${payload.account_id}`);
  await logAudit({
    action: "contact.created",
    entityType: "contact",
    entityId: data.id,
    entityLabel: `${data.first_name} ${data.last_name}`.trim(),
  });
  return data;
}

/** Mirror of leads.ts's LEAD_TO_CONTACT_FIELD, reversed — a converted lead and
 *  its contact are the same person, so an edit on either side should keep
 *  both in sync, not just Lead → Contact. */
const CONTACT_TO_LEAD_FIELD: Partial<Record<keyof ContactRow, string>> = {
  email: "email",
  phone: "phone",
  linkedin: "linkedin",
  job_title: "job_title",
  twitter: "twitter_handle",
  mailing_street: "street_address",
  mailing_city: "city",
  mailing_state: "state",
  mailing_country: "country",
  mailing_zip: "postal_code",
};

async function syncConvertedLead(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contactId: string,
  payload: Partial<ContactRow>
): Promise<void> {
  const patch: Record<string, unknown> = {};
  for (const [contactField, leadField] of Object.entries(CONTACT_TO_LEAD_FIELD)) {
    if (contactField in payload) patch[leadField] = payload[contactField as keyof ContactRow];
  }
  if ("first_name" in payload || "last_name" in payload) {
    const { data: current } = await supabase.from("contacts").select("first_name, last_name").eq("id", contactId).single();
    const first = payload.first_name ?? current?.first_name ?? "";
    const last = payload.last_name ?? current?.last_name ?? "";
    patch.full_name = `${first} ${last}`.trim() || null;
  }
  if (!Object.keys(patch).length) return;

  const { data: leads } = await supabase.from("leads").select("id").eq("converted_contact_id", contactId);
  if (!leads?.length) return;
  await supabase.from("leads").update(patch).in("id", leads.map((l) => l.id));
  revalidatePath("/leads");
  for (const l of leads) revalidatePath(`/leads/${l.id}`);
}

export async function updateContact(id: string, payload: Partial<ContactRow>) {
  assertValidContactPhoneFields(payload);
  assertValidContactLinkedIn(payload);
  const supabase = await createClient();
  // .select("id") to get the updated row back — PostgREST reports no error when
  // RLS silently blocks an update (0 rows affected looks identical to success
  // otherwise), same footgun already handled below in deleteContact.
  const { data, error } = await supabase.from("contacts").update(payload).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Contact not found, or you don't have permission to edit it.");
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  if (payload.account_id) revalidatePath(`/accounts/${payload.account_id}`);
  await logAudit({ action: "contact.updated", entityType: "contact", entityId: id, metadata: payload as Record<string, unknown> });

  // Best-effort — a sync failure here should never roll back or block the
  // contact's own save (mirrors leads.ts's syncConvertedRecords).
  await syncConvertedLead(supabase, id, payload).catch(() => {});
}

export async function deleteContact(id: string) {
  const supabase = await createClient();
  // .select() to get the deleted row(s) back — PostgREST reports no error
  // when RLS silently blocks a delete (0 rows affected looks identical to
  // success otherwise), so this is the only way to detect and report it.
  const { data, error } = await supabase.from("contacts").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Contact not found, or you don't have permission to delete it.");
  revalidatePath("/contacts");
  await logAudit({ action: "contact.deleted", entityType: "contact", entityId: id });
}

export async function bulkDeleteContacts(ids: string[]) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("contacts").delete().in("id", ids).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("None of the selected contacts could be deleted.");
  revalidatePath("/contacts");
  await logAudit({ action: "contact.bulk_deleted", entityType: "contact", metadata: { count: ids.length, ids } });
}
