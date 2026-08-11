"use server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, emailConfigured, emailDomainVerified } from "./resend";
import { getLeadById } from "@/lib/queries/leads";
import { isBlocked } from "@/lib/queries/blocklist";
import { substituteMergeTags } from "@/lib/email/merge-tags";
import { getCurrentUserProfile } from "@/lib/queries/users";
import { getOnboarding } from "@/lib/queries/onboarding";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { logAudit } from "@/lib/queries/audit-log";
import { revalidatePath } from "next/cache";

export async function getEmailStatus() {
  return { configured: emailConfigured, domainVerified: emailDomainVerified };
}

/** Whether any outbound email has ever been sent to this lead (campaign or
 *  one-off) — drives the "you already emailed this lead" badge on reopen. */
export async function hasSentEmailToLead(leadId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("inbox_messages")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("direction", "outbound");
  return (count || 0) > 0;
}

export interface SendLeadEmailResult {
  ok: boolean;
  error?: string;
  redirectedTo?: string;
}

/**
 * Sends an email to a lead via Brevo and logs it as an outbound message
 * in the inbox thread so it shows up in conversation history.
 */
export async function sendLeadEmail(leadId: string, subject: string, body: string): Promise<SendLeadEmailResult> {
  const lead = await getLeadById(leadId);
  if (!lead) return { ok: false, error: "Lead not found" };
  if (!lead.email) return { ok: false, error: "This lead has no email address" };

  if (await isBlocked(lead.email)) {
    return { ok: false, error: "This recipient is on your blocklist" };
  }

  const profile = await getCurrentUserProfile().catch(() => null);
  const senderName = (profile as { full_name?: string | null } | null)?.full_name || undefined;
  const finalSubject = substituteMergeTags(subject, lead, senderName);
  const finalBody = substituteMergeTags(body, lead, senderName);

  // From Name recipients see = the workspace's company name (or "Nxelio Nurture").
  const { data: onboarding } = await getOnboarding();
  const fromName = onboarding?.company_name?.trim() || "Nxelio Nurture";

  // Route replies to whichever mailbox is actually connected, not a stale env var.
  // Unipile puts the real mailbox address in `name`, not `identifier` — every
  // connected email account has an empty `identifier`, so selecting only that
  // column always silently fell back to sendEmail's hardcoded default instead
  // of this workspace's actual connected mailbox.
  // ORDER BY is required: if a workspace reconnected its mailbox (old row never
  // flipped to 'disconnected'), Postgres returns rows in an unspecified order
  // for a bare LIMIT 1 — replies would land in whichever stale mailbox won the
  // coin flip. Newest connected row always wins instead.
  const supabase = await createClient();
  const { data: mailbox } = await supabase
    .from("outreach_accounts")
    .select("identifier, name")
    .eq("channel", "email")
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const result = await sendEmail({
    to: lead.email,
    subject: finalSubject,
    text: finalBody,
    fromName,
    replyTo: (mailbox?.identifier as string) || (mailbox?.name as string) || undefined,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  // Log to inbox as outbound message (store the substituted text)
  await supabase.from("inbox_messages").insert({
    lead_id: leadId,
    direction: "outbound",
    subject: finalSubject,
    body: finalBody,
    is_read: true,
  });

  revalidatePath("/inbox");
  revalidatePath(`/leads/${leadId}`);

  await notifyCurrentUser({
    type: "email",
    title: `Email sent to ${lead.full_name || lead.company_name || lead.email}`,
    message: finalSubject,
    link: `/leads/${leadId}`,
  });
  await logAudit({
    action: "lead.emailed",
    entityType: "lead",
    entityId: leadId,
    entityLabel: lead.full_name || lead.company_name || lead.email || undefined,
    metadata: { subject: finalSubject },
  });

  return { ok: true, redirectedTo: result.redirectedTo };
}

/** Sends a one-off test email to the configured test inbox. */
export async function sendTestEmail(subject: string, body: string): Promise<SendLeadEmailResult> {
  const result = await sendEmail({
    to: process.env.EMAIL_TEST_RECIPIENT || "",
    subject,
    text: body,
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
