"use server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { getOnboarding } from "@/lib/queries/onboarding";
import { isBlocked } from "@/lib/queries/blocklist";
import { revalidatePath } from "next/cache";
import type { ComposeEmailInput } from "@/lib/queries/contact-emails";

export interface AccountEmailRow {
  id: string;
  account_id: string | null;
  direction: string;
  to_email: string | null;
  subject: string | null;
  body: string | null;
  created_at: string;
}

function splitAddresses(list?: string): string[] {
  return (list || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

/** Real sent/received/draft email history for an account — same inbox_messages
 *  table Leads already use (0112 added account_id, 0105 added to_email). */
export async function getAccountEmails(accountId: string): Promise<AccountEmailRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inbox_messages")
    .select("id, account_id, direction, to_email, subject, body, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  return (data as AccountEmailRow[]) || [];
}

/** Sends a real email via the configured provider and logs it into
 *  inbox_messages with account_id + to_email set. Cc/Bcc are passed to the
 *  send API but not persisted — only the primary "To" is kept in history. */
export async function sendAccountEmail(accountId: string, input: ComposeEmailInput): Promise<{ ok: boolean; error?: string; simulated?: boolean }> {
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
    account_id: accountId,
    direction: "outbound",
    to_email: recipient,
    subject: input.subject,
    body: input.body,
    is_read: true,
  });
  revalidatePath(`/accounts/${accountId}`);
  return { ok: true, simulated: result.simulated };
}

/** Saves (or updates) a draft — not sent, just recorded so it can be finished
 *  later. Pass draftId to update an existing draft instead of creating a new one. */
export async function saveAccountEmailDraft(accountId: string, input: ComposeEmailInput, draftId?: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  const supabase = await createClient();
  const row = {
    account_id: accountId,
    direction: "draft",
    to_email: input.to.trim() || null,
    subject: input.subject || null,
    body: input.body || null,
  };
  if (draftId) {
    const { error } = await supabase.from("inbox_messages").update(row).eq("id", draftId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/accounts/${accountId}`);
    return { ok: true, id: draftId };
  }
  const { data, error } = await supabase.from("inbox_messages").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/accounts/${accountId}`);
  return { ok: true, id: data.id };
}

export async function deleteAccountEmail(id: string, accountId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("inbox_messages").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/accounts/${accountId}`);
  return { ok: true };
}
