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

/** Pass a campaignId to scope the inbox to one campaign's replies (used by the
 *  campaign detail screen's "Inbox" tab instead of a separate inbox system). */
export async function getInboxConversations(campaignId?: string): Promise<InboxConversation[]> {
  const supabase = await createClient();
  let q = supabase
    .from("inbox_messages")
    .select(`
      *,
      leads(full_name, company_name, email),
      campaigns(campaign_name)
    `)
    .eq("direction", "inbound");
  if (campaignId) q = q.eq("campaign_id", campaignId);
  const { data, error } = await q.order("created_at", { ascending: false });
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

/** Every message this workspace has sent, newest first — the real "Sent" folder
 *  for the Activities > Emails screen (mirrors getInboxConversations' shape,
 *  but ungrouped and scoped to direction=outbound). */
export async function getSentMessages(): Promise<InboxConversation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbox_messages")
    .select(`
      *,
      leads(full_name, company_name, email),
      campaigns(campaign_name)
    `)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return data.map((m) => {
    const leads = (m as { leads?: { full_name?: string; company_name?: string; email?: string } }).leads;
    const campaigns = (m as { campaigns?: { campaign_name?: string } }).campaigns;
    return {
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
    };
  });
}

/** Pass campaignId when viewing this thread from a specific campaign's own
 *  Inbox tab, so it only shows that campaign's messages — otherwise a lead
 *  enrolled in several campaigns shows every one of them mixed together. */
export async function getInboxThread(leadId: string, campaignId?: string): Promise<InboxMessage[]> {
  const supabase = await createClient();
  let q = supabase.from("inbox_messages").select("*").eq("lead_id", leadId);
  if (campaignId) q = q.eq("campaign_id", campaignId);
  const { data } = await q.order("created_at", { ascending: true });
  return data || [];
}

export async function markRead(id: string) {
  const supabase = await createClient();
  await supabase.from("inbox_messages").update({ is_read: true }).eq("id", id);
  // Inbox is now viewed embedded on each campaign's own "Inbox" tab, not a
  // standalone page — revalidate that whole subtree so it reflects the change.
  revalidatePath("/campaigns", "layout");
}

export async function markUnread(id: string) {
  const supabase = await createClient();
  await supabase.from("inbox_messages").update({ is_read: false }).eq("id", id);
  revalidatePath("/campaigns", "layout");
}

/** Permanently deletes one lead's whole conversation (all their inbox messages). */
export async function deleteInboxConversation(leadId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("inbox_messages").delete().eq("lead_id", leadId);
  if (error) throw error;
  revalidatePath("/campaigns", "layout");
}

export async function sendReply(
  leadId: string,
  subject: string,
  body: string
): Promise<{ ok: boolean; error?: string; simulated?: boolean }> {
  const supabase = await createClient();

  // Actually deliver the reply via the email service (Brevo/dev-sim) —
  // previously this only logged a row without sending anything.
  const { data: lead } = await supabase
    .from("leads")
    .select("email, linkedin, linkedin_provider_id, workspace_id")
    .eq("id", leadId)
    .single();

  // Reply on whatever channel this conversation has actually been using — a
  // hybrid lead can have both an email and a LinkedIn profile, so "has an
  // email" alone isn't a safe signal. Check whether ANY outbound message in
  // this thread was ever tagged as LinkedIn (the original campaign step
  // carries that subject) — checking only the MOST RECENT one breaks after
  // the first manual reply, since a manual reply's own subject is the
  // generic "Re: Reply", not "LinkedIn message"/"LinkedIn connection request".
  const { data: outboundHistory } = await supabase
    .from("inbox_messages")
    .select("subject")
    .eq("lead_id", leadId)
    .eq("direction", "outbound");
  const isLinkedInThread = (outboundHistory || []).some((m) => /linkedin/i.test(m.subject || ""));

  let simulated = false;
  if (lead?.email && !isLinkedInThread) {
    const { sendEmail } = await import("@/lib/email/resend");
    const { getOnboarding } = await import("@/lib/queries/onboarding");
    const { data: onboarding } = await getOnboarding();
    const fromName = onboarding?.company_name?.trim() || "Nxelio Nurture";
    const result = await sendEmail({ to: lead.email, subject, text: body, fromName });
    if (!result.ok) return { ok: false, error: result.error };
    simulated = result.simulated ?? false;
  } else if (lead?.linkedin || lead?.linkedin_provider_id) {
    // A LinkedIn conversation. Previously this branch didn't exist at all,
    // so a reply typed here was only ever saved locally and never actually
    // reached LinkedIn.
    const { unipileConfigured, unipileResolveProfile, unipileSendLinkedInMessage } = await import("@/lib/outreach/unipile");
    if (!unipileConfigured) return { ok: false, error: "LinkedIn (Unipile) not configured" };

    const { data: account } = await supabase
      .from("outreach_accounts")
      .select("account_id")
      .eq("workspace_id", lead.workspace_id)
      .eq("channel", "linkedin")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();
    if (!account) return { ok: false, error: "No connected LinkedIn account" };

    let providerId = lead.linkedin_provider_id as string | null;
    if (!providerId) {
      const resolved = await unipileResolveProfile({ accountId: account.account_id, identifier: (lead.linkedin as string) || "" });
      if (!resolved.providerId) return { ok: false, error: resolved.error || "Could not resolve LinkedIn profile" };
      providerId = resolved.providerId;
      await supabase.from("leads").update({ linkedin_provider_id: providerId }).eq("id", leadId);
    }

    try {
      await unipileSendLinkedInMessage({ accountId: account.account_id, providerId, text: body });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "LinkedIn send failed" };
    }
  }

  await supabase.from("inbox_messages").insert({
    lead_id: leadId,
    direction: "outbound",
    subject,
    body,
    is_read: true,
  });
  revalidatePath("/campaigns", "layout");
  return { ok: true, simulated };
}

/**
 * Sends a real email from the Activities > Emails composer to any address.
 * When the recipient matches an existing lead, this reuses sendReply() so it
 * gets the exact same real send path (email or LinkedIn fallback) and gets
 * logged as a real conversation message. When the recipient isn't a known
 * lead yet, it still sends for real via the email provider, it just isn't
 * tied to any lead record (no fake entry gets created either way).
 */
export async function sendComposedEmail(
  to: string,
  subject: string,
  body: string
): Promise<{ ok: boolean; error?: string; simulated?: boolean }> {
  const recipient = to.trim();
  if (!recipient) return { ok: false, error: "Recipient email is required" };
  if (!subject.trim()) return { ok: false, error: "Subject is required" };

  const supabase = await createClient();
  const { data: matchedLead } = await supabase.from("leads").select("id").eq("email", recipient).maybeSingle();
  if (matchedLead) {
    return sendReply(matchedLead.id, subject, body);
  }

  const { sendEmail } = await import("@/lib/email/resend");
  const { getOnboarding } = await import("@/lib/queries/onboarding");
  const { isBlocked } = await import("@/lib/queries/blocklist");
  if (await isBlocked(recipient)) return { ok: false, error: "This recipient is on your blocklist" };

  const { data: onboarding } = await getOnboarding();
  const fromName = onboarding?.company_name?.trim() || "Nxelio Nurture";
  const result = await sendEmail({ to: recipient, subject, text: body, fromName });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, simulated: result.simulated };
}
