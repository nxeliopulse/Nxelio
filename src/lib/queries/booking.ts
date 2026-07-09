"use server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWorkspaceBusy } from "./calendar-accounts";
import { sendEmail } from "@/lib/email/resend";
import { generateConferenceLink } from "@/lib/meetings/conference-link";

// Booking defaults (kept simple; could become per-workspace config later).
const SLOT_MIN = 30;
const WORK_START = 9;   // hour
const WORK_END = 17;    // hour (exclusive)
const DAYS_AHEAD = 7;

export interface BookingSlot { startIso: string; endIso: string }
export interface BookingDay { date: string; slots: BookingSlot[] }

interface WsInfo { id: string; companyName: string }

async function workspaceBySlug(slug: string): Promise<WsInfo | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workspaces")
    .select("id, name, onboarding")
    .eq("capture_slug", slug)
    .single();
  if (!data) return null;
  const companyName = (data.onboarding as { company_name?: string } | null)?.company_name?.trim() || data.name || "Nxelio";
  return { id: data.id, companyName };
}

export async function getBookingInfo(slug: string): Promise<{ exists: boolean; hostName?: string }> {
  const ws = await workspaceBySlug(slug);
  return ws ? { exists: true, hostName: ws.companyName } : { exists: false };
}

/** Available 30-min slots over the next business week, minus the host's busy calendar times. */
export async function getBookingSlots(slug: string): Promise<{ days: BookingDay[] }> {
  const ws = await workspaceBySlug(slug);
  if (!ws) return { days: [] };

  const rangeStart = new Date();
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart.getTime() + DAYS_AHEAD * 86400000);
  const busy = await getWorkspaceBusy(ws.id, rangeStart.toISOString(), rangeEnd.toISOString());

  const days: BookingDay[] = [];
  for (let d = 0; d < DAYS_AHEAD; d++) {
    const day = new Date(rangeStart.getTime() + d * 86400000);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    const slots: BookingSlot[] = [];
    for (let h = WORK_START; h < WORK_END; h++) {
      for (const m of [0, 30]) {
        const s = new Date(day); s.setHours(h, m, 0, 0);
        const e = new Date(s.getTime() + SLOT_MIN * 60000);
        if (s.getTime() < Date.now()) continue;
        if (busy.some((b) => new Date(b.start) < e && new Date(b.end) > s)) continue;
        slots.push({ startIso: s.toISOString(), endIso: e.toISOString() });
      }
    }
    if (slots.length) days.push({ date: day.toISOString(), slots });
  }
  return { days };
}

/** A visitor books a slot: creates the meeting, links/creates a lead, emails a confirmation. */
export async function bookMeeting(input: {
  slug: string;
  name: string;
  email: string;
  note?: string;
  startIso: string;
  endIso: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.name.trim()) return { ok: false, error: "Please enter your name." };
  if (!input.email.includes("@")) return { ok: false, error: "Please enter a valid email." };

  const ws = await workspaceBySlug(input.slug);
  if (!ws) return { ok: false, error: "This booking page doesn't exist." };

  const admin = createAdminClient();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  // Re-check the slot is still free (avoid double-booking between page load and submit).
  const busy = await getWorkspaceBusy(ws.id, input.startIso, input.endIso);
  const s = new Date(input.startIso), e = new Date(input.endIso);
  if (busy.some((b) => new Date(b.start) < e && new Date(b.end) > s)) {
    return { ok: false, error: "That time was just taken — please pick another slot." };
  }

  // Find or create the lead for this visitor.
  let leadId: string | null = null;
  const { data: existing } = await admin.from("leads").select("id").eq("workspace_id", ws.id).eq("email", email).maybeSingle();
  if (existing) {
    leadId = (existing as { id: string }).id;
  } else {
    const { data: created } = await admin
      .from("leads")
      .insert({ workspace_id: ws.id, full_name: name, email, source: "Booking Link", status: "New", lead_score: 0 })
      .select("id")
      .single();
    leadId = (created as { id: string } | null)?.id ?? null;
  }

  const joinUrl = generateConferenceLink("google_meet");
  const { error } = await admin.from("meetings").insert({
    workspace_id: ws.id,
    title: `Meeting with ${name}`,
    start_at: input.startIso,
    end_at: input.endIso,
    provider: "google_meet",
    join_url: joinUrl,
    status: "scheduled",
    lead_id: leadId,
    attendees: [{ name, email }],
    description: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  // Confirmation email to the booker (best-effort; booking still succeeds if email fails).
  const when = new Date(input.startIso).toLocaleString(undefined, {
    weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const text = `Hi ${name.split(" ")[0]},\n\nYour meeting with ${ws.companyName} is confirmed for ${when}.\n\nJoin: ${joinUrl}${input.note?.trim() ? `\n\nNote: ${input.note.trim()}` : ""}\n\nSee you there,\n${ws.companyName}`;
  await sendEmail({ to: email, subject: `Meeting confirmed — ${when}`, text, fromName: ws.companyName }).catch(() => {});

  return { ok: true };
}
