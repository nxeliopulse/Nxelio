"use server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { getOnboarding } from "@/lib/queries/onboarding";
import { logAudit } from "@/lib/queries/audit-log";
import { revalidatePath } from "next/cache";
import { pauseCampaignEnrollmentsForMeeting } from "@/lib/campaigns/enrollment";
import { getLeadById } from "@/lib/queries/leads";
import { unipileConfigured, unipileSendWhatsAppMessage } from "@/lib/outreach/unipile";

export interface MeetingAttendee { name?: string; email?: string }

export interface MeetingRow {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  location: string | null;
  join_url: string | null;
  provider: string | null;
  status: "scheduled" | "completed" | "canceled" | string;
  lead_id: string | null;
  contact_id: string | null;
  account_id: string | null;
  attendees: MeetingAttendee[];
  recording_url: string | null;
  summary: string | null;
  created_at: string;
  // Joined contact (LP-25)
  lead?: { id: string; full_name: string | null; company_name: string | null; email: string | null } | null;
}

export interface MeetingInput {
  title: string;
  description?: string | null;
  start_at: string;       // ISO
  end_at: string;         // ISO
  location?: string | null;
  join_url?: string | null;
  provider?: string | null;
  lead_id?: string | null;
  contact_id?: string | null;
  account_id?: string | null;
  attendees?: MeetingAttendee[];
  recording_url?: string | null;
  summary?: string | null;
}

const SELECT = "id, title, description, start_at, end_at, location, join_url, provider, status, lead_id, contact_id, account_id, attendees, recording_url, summary, created_at, lead:leads(id, full_name, company_name, email)";

export async function getMeetings(): Promise<MeetingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .select(SELECT)
    .order("start_at", { ascending: true });
  if (error) {
    // Table not migrated yet (0031) or query error — fail soft so the page renders.
    return [];
  }
  return (data as unknown as MeetingRow[]) ?? [];
}

/** A single lead's meetings, newest-first — for the lead detail page's related list. */
export async function getMeetingsForLead(leadId: string): Promise<MeetingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .select(SELECT)
    .eq("lead_id", leadId)
    .order("start_at", { ascending: false });
  if (error) return [];
  return (data as unknown as MeetingRow[]) ?? [];
}

/** A single contact's meetings, newest-first — for the contact detail page's related list. */
export async function getMeetingsForContact(contactId: string): Promise<MeetingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .select(SELECT)
    .eq("contact_id", contactId)
    .order("start_at", { ascending: false });
  if (error) return [];
  return (data as unknown as MeetingRow[]) ?? [];
}

/** A single account's meetings, newest-first — for the account detail page's related list. */
export async function getMeetingsForAccount(accountId: string): Promise<MeetingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .select(SELECT)
    .eq("account_id", accountId)
    .order("start_at", { ascending: false });
  if (error) return [];
  return (data as unknown as MeetingRow[]) ?? [];
}

export async function createMeeting(input: MeetingInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("meetings").insert({
    title: input.title,
    description: input.description ?? null,
    start_at: input.start_at,
    end_at: input.end_at,
    location: input.location ?? null,
    join_url: input.join_url ?? null,
    provider: input.provider ?? "manual",
    lead_id: input.lead_id || null,
    contact_id: input.contact_id || null,
    account_id: input.account_id || null,
    attendees: input.attendees ?? [],
  });
  if (error) return { ok: false, error: error.message };
  if (input.lead_id) await pauseCampaignEnrollmentsForMeeting(input.lead_id).catch(() => {});
  revalidatePath("/meetings");
  await logAudit({ action: "meeting.created", entityType: "meeting", entityLabel: input.title });
  return { ok: true };
}

export async function updateMeeting(id: string, input: Partial<MeetingInput> & { status?: string }): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  for (const k of ["title", "description", "start_at", "end_at", "location", "join_url", "provider", "lead_id", "contact_id", "account_id", "attendees", "recording_url", "summary", "status"] as const) {
    if (k in input && input[k as keyof typeof input] !== undefined) patch[k] = input[k as keyof typeof input];
  }
  if (patch.lead_id === "") patch.lead_id = null;
  const { error } = await supabase.from("meetings").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/meetings");
  await logAudit({ action: "meeting.updated", entityType: "meeting", entityId: id, metadata: patch });
  return { ok: true };
}

function formatWhen(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const date = s.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date}, ${t(s)} – ${t(e)}`;
}

/**
 * Epic 4 (LP-19): creates a meeting AND emails an invite (with the join link) to
 * every attendee that has an email. Falls back to "Nxelio Nurture" as the From Name when
 * the workspace hasn't set a company name. Returns how many invites went out.
 * If the meeting is tied to a lead with a phone number and the workspace has a
 * connected WhatsApp number, also sends the same invite over WhatsApp — this is
 * the only place WhatsApp is used today (not campaign sending).
 */
export async function scheduleMeeting(
  input: MeetingInput,
  opts?: { sendInvites?: boolean }
): Promise<{ ok: boolean; error?: string; invitesSent?: number; whatsappSent?: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("meetings").insert({
    title: input.title,
    description: input.description ?? null,
    start_at: input.start_at,
    end_at: input.end_at,
    location: input.location ?? null,
    join_url: input.join_url ?? null,
    provider: input.provider ?? "manual",
    lead_id: input.lead_id || null,
    contact_id: input.contact_id || null,
    account_id: input.account_id || null,
    attendees: input.attendees ?? [],
  });
  if (error) return { ok: false, error: error.message };
  if (input.lead_id) await pauseCampaignEnrollmentsForMeeting(input.lead_id).catch(() => {});

  let invitesSent = 0;
  let whatsappSent = false;
  if (opts?.sendInvites !== false) {
    const { data: onboarding } = await getOnboarding();
    const fromName = onboarding?.company_name?.trim() || "Nxelio Nurture";
    const when = formatWhen(input.start_at, input.end_at);
    const whereLine = input.join_url
      ? `\n\nJoin: ${input.join_url}`
      : input.location ? `\n\nLocation: ${input.location}` : "";
    for (const a of input.attendees ?? []) {
      if (!a.email) continue;
      const hi = a.name ? ` ${a.name.split(" ")[0]}` : "";
      const text = `Hi${hi},\n\nYou're invited to "${input.title}".\n\nWhen: ${when}${whereLine}${input.description ? `\n\n${input.description}` : ""}\n\nSee you there,\n${fromName}`;
      const r = await sendEmail({ to: a.email, subject: `Invitation: ${input.title} — ${when}`, text, fromName });
      if (r.ok) invitesSent++;
    }

    // WhatsApp invite to the lead's own phone (not every attendee) — sent
    // alongside the email invite whenever a number is connected and the lead
    // has a phone on file. Never blocks the meeting on a send failure.
    if (input.lead_id && unipileConfigured) {
      try {
        const lead = await getLeadById(input.lead_id);
        if (lead?.phone) {
          const { data: acct } = await supabase
            .from("outreach_accounts")
            .select("account_id")
            .eq("channel", "whatsapp")
            .eq("status", "connected")
            .limit(1)
            .maybeSingle();
          const accountId = (acct?.account_id as string) ?? null;
          if (accountId) {
            const hi = lead.full_name ? ` ${lead.full_name.split(" ")[0]}` : "";
            const text = `Hi${hi}, you're invited to "${input.title}".\n\nWhen: ${when}${whereLine}${input.description ? `\n\n${input.description}` : ""}\n\n— ${fromName}`;
            await unipileSendWhatsAppMessage({ accountId, phone: lead.phone, text });
            whatsappSent = true;
            await supabase.from("inbox_messages").insert({
              lead_id: lead.id, direction: "outbound", subject: "WhatsApp meeting invite", body: text, is_read: true,
            });
          }
        }
      } catch (e) {
        // A WhatsApp hiccup should never break scheduling — the email invite still went out.
        console.error("[scheduleMeeting] WhatsApp send failed:", e instanceof Error ? e.message : e);
      }
    }
  }

  revalidatePath("/meetings");
  await logAudit({ action: "meeting.scheduled", entityType: "meeting", entityLabel: input.title, metadata: { invitesSent, whatsappSent } });
  return { ok: true, invitesSent, whatsappSent };
}

export async function cancelMeeting(id: string): Promise<{ ok: boolean; error?: string }> {
  return updateMeeting(id, { status: "canceled" });
}

export async function deleteMeeting(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("meetings").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/meetings");
  await logAudit({ action: "meeting.deleted", entityType: "meeting", entityId: id });
  return { ok: true };
}
