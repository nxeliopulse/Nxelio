"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface InboxMessage {
  id: string;
  lead_id: string | null;
  campaign_id: string | null;
  direction: string;
  subject: string | null;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

export interface InboxConversation extends InboxMessage {
  lead_name: string | null;
  lead_company: string | null;
  lead_email: string | null;
  campaign_name: string | null;
}

export async function getInboxConversations(): Promise<InboxConversation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbox_messages")
    .select(`
      *,
      leads(full_name, company_name, email),
      campaigns(campaign_name)
    `)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  // Group by lead so each person shows as ONE conversation card. Messages are
  // newest-first, so the first per lead is the latest. A conversation is unread
  // if ANY of that lead's inbound messages is unread.
  const byLead = new Map<string, InboxConversation>();
  const anyUnread = new Set<string>();
  for (const m of data) {
    const leads = (m as { leads?: { full_name?: string; company_name?: string; email?: string } }).leads;
    const campaigns = (m as { campaigns?: { campaign_name?: string } }).campaigns;
    const key = (m.lead_id as string) || m.id;
    if (!m.is_read) anyUnread.add(key);
    if (byLead.has(key)) continue; // keep only the latest message as the card
    byLead.set(key, {
      id: m.id,
      lead_id: m.lead_id,
      campaign_id: m.campaign_id,
      direction: m.direction,
      subject: m.subject,
      body: m.body,
      is_read: m.is_read,
      created_at: m.created_at,
      lead_name: leads?.full_name || leads?.company_name || "Unknown",
      lead_company: leads?.company_name || null,
      lead_email: leads?.email || null,
      campaign_name: campaigns?.campaign_name || null,
    });
  }
  return [...byLead.values()].map((c) => ({ ...c, is_read: !anyUnread.has((c.lead_id as string) || c.id) }));
}

export async function getInboxThread(leadId: string): Promise<InboxMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inbox_messages")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });
  return data || [];
}

export async function getUnreadInboxCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("inbox_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .eq("is_read", false);
  return count ?? 0;
}

export async function markRead(id: string) {
  const supabase = await createClient();
  await supabase.from("inbox_messages").update({ is_read: true }).eq("id", id);
  revalidatePath("/inbox");
}

export async function markUnread(id: string) {
  const supabase = await createClient();
  await supabase.from("inbox_messages").update({ is_read: false }).eq("id", id);
  revalidatePath("/inbox");
}

/** Permanently deletes one lead's whole conversation (all their inbox messages). */
export async function deleteInboxConversation(leadId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("inbox_messages").delete().eq("lead_id", leadId);
  if (error) throw error;
  revalidatePath("/inbox");
}

export async function sendReply(
  leadId: string,
  subject: string,
  body: string
): Promise<{ ok: boolean; error?: string; simulated?: boolean }> {
  const supabase = await createClient();

  // Actually deliver the reply via the email service (Brevo/Resend/dev-sim) —
  // previously this only logged a row without sending anything.
  const { data: lead } = await supabase.from("leads").select("email").eq("id", leadId).single();
  let simulated = false;
  if (lead?.email) {
    const { sendEmail } = await import("@/lib/email/resend");
    const result = await sendEmail({ to: lead.email, subject, text: body });
    if (!result.ok) return { ok: false, error: result.error };
    simulated = result.simulated ?? false;
  }

  await supabase.from("inbox_messages").insert({
    lead_id: leadId,
    direction: "outbound",
    subject,
    body,
    is_read: true,
  });
  revalidatePath("/inbox");
  return { ok: true, simulated };
}
