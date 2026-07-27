"use server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/queries/audit-log";
import { revalidatePath } from "next/cache";

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
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactWithAccount extends ContactRow {
  account: { id: string; account_name: string } | null;
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
    .select("*, account:accounts(id, account_name)")
    .eq("id", id)
    .single();
  return data as ContactWithAccount | null;
}

export async function createContact(payload: Partial<ContactRow>) {
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

export async function updateContact(id: string, payload: Partial<ContactRow>) {
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").update(payload).eq("id", id);
  if (error) throw error;
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  if (payload.account_id) revalidatePath(`/accounts/${payload.account_id}`);
  await logAudit({ action: "contact.updated", entityType: "contact", entityId: id, metadata: payload as Record<string, unknown> });
}

export async function deleteContact(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/contacts");
  await logAudit({ action: "contact.deleted", entityType: "contact", entityId: id });
}

export async function bulkDeleteContacts(ids: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().in("id", ids);
  if (error) throw error;
  revalidatePath("/contacts");
  await logAudit({ action: "contact.bulk_deleted", entityType: "contact", metadata: { count: ids.length, ids } });
}
