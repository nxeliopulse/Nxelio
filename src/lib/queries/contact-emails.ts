"use server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { getOnboarding } from "@/lib/queries/onboarding";
import { isBlocked } from "@/lib/queries/blocklist";
import { revalidatePath } from "next/cache";
import { isFeatureEnabledForCurrentUser } from "@/lib/queries/feature-kill-switches";

export interface ContactEmailRow {
  id: string;
  contact_id: string | null;
  direction: string;
  to_email: string | null;
  subject: string | null;
  body: string | null;
  created_at: string;
}

export interface ComposeEmailInput {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
}

function splitAddresses(list?: string): string[] {
  return (list || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

/** Real sent/received/draft email history for a contact — same inbox_messages
 *  table Leads already use (0102 added contact_id, 0105 added to_email). */
export async function getContactEmails(contactId: string): Promise<ContactEmailRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inbox_messages")
    .select("id, contact_id, direction, to_email, subject, body, created_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });
  return (data as ContactEmailRow[]) || [];
}

/** Sends a real email via the configured provider and logs it into
 *  inbox_messages with contact_id + to_email set. Cc/Bcc are passed to the
 *  send API but not persisted — only the primary "To" is kept in history. */
export async function sendContactEmail(contactId: string, input: ComposeEmailInput): Promise<{ ok: boolean; error?: string; simulated?: boolean }> {
  if (!(await isFeatureEnabledForCurrentUser("send_email"))) {
    return { ok: false, error: "Sending email has been temporarily disabled by the administrator." };
  }
  const recipient = input.to.trim();
  if (!recipient) return { ok: false, error: "A recipient (To) is required." };
  if (!input.subject.trim()) return { ok: false, error: "Subject is required." };
  if (await isBlocked(recipient)) return { ok: false, error: "This recipient is on your blocklist." };

  const { data: onboarding } = await getOnboarding();
  const fromName = onboarding?.company_name?.trim() || "Nxelio Nurture";
  const result = await sendEmail({
    to: recipient,
    subject: input.subject,
    text: input.body,
    fromName,
    cc: splitAddresses(input.cc),
    bcc: splitAddresses(input.bcc),
  });
  if (!result.ok) return { ok: false, error: result.error };

  const supabase = await createClient();
  await supabase.from("inbox_messages").insert({
    contact_id: contactId,
    direction: "outbound",
    to_email: recipient,
    subject: input.subject,
    body: input.body,
    is_read: true,
  });
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true, simulated: result.simulated };
}

/** Saves (or updates) a draft — not sent, just recorded so it can be finished
 *  later. Pass draftId to update an existing draft instead of creating a new one. */
export async function saveContactEmailDraft(contactId: string, input: ComposeEmailInput, draftId?: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  const supabase = await createClient();
  const row = {
    contact_id: contactId,
    direction: "draft",
    to_email: input.to.trim() || null,
    subject: input.subject || null,
    body: input.body || null,
  };
  if (draftId) {
    const { error } = await supabase.from("inbox_messages").update(row).eq("id", draftId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/contacts/${contactId}`);
    return { ok: true, id: draftId };
  }
  const { data, error } = await supabase.from("inbox_messages").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true, id: data.id };
}

export async function deleteContactEmail(id: string, contactId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("inbox_messages").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}
