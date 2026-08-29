"use server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { generateConferenceLink } from "@/lib/meetings/conference-link";
import { getLiveRepForSlot, getDefaultNotifyRecipients } from "@/lib/queries/demo-call-admin";
import { createMeetLinkForAccountEmail } from "@/lib/queries/calendar-accounts";
import type { CalProvider } from "@/lib/calendar/providers";

// Last-resort safety net only — fires exclusively when nobody is marked live
// for the booked slot AND no one in the Demo Call Admin roster is marked
// default. In normal operation the notify address always comes from that
// roster (see resolveNotifyEmails), never from this constant, so a booking
// is never silently lost even on a freshly-set-up, unconfigured roster.
const LAST_RESORT_NOTIFY_EMAIL = "anu@nxelio.ai";

const PROVIDER_LABEL: Record<CalProvider, string> = {
  google: "Google Calendar",
  microsoft: "Outlook / Microsoft Calendar",
  zoho: "Zoho Calendar",
};

const MEETING_DURATION_MIN = 15; // keep in sync with book-demo-modal.tsx's own MEETING_DURATION_MIN

export interface DemoRequestInput {
  fullName: string;
  businessEmail: string;
  phone: string;
  companyName: string;
  industry: string;
  employeeCount: string;
  monthlyRevenue: string;
  purpose: string;
  referralSource: string;
  date: string; // "YYYY-MM-DD"
  hour: string; // "1".."12"
  minute: string; // "00".."59"
  meridiem: "AM" | "PM";
}

export interface DemoRequestResult {
  ok: boolean;
  error?: string;
  joinUrl?: string;
  formattedDate?: string;
  formattedTime?: string;
}

function combineDateTime(date: string, hour: string, minute: string, meridiem: "AM" | "PM"): Date | null {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  let h = parseInt(hour, 10);
  if (Number.isNaN(h) || h < 1 || h > 12) return null;
  const min = parseInt(minute, 10);
  if (Number.isNaN(min) || min < 0 || min > 59) return null;
  if (meridiem === "PM" && h !== 12) h += 12;
  if (meridiem === "AM" && h === 12) h = 0;
  const dt = new Date(y, m - 1, d, h, min, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Who gets the booking notification, in priority order: whoever is live for
 *  this exact slot > whoever's marked "default" in the Demo Call Admin
 *  roster > the hardcoded last-resort address. Always DB-driven except for
 *  that final fallback, so changing the roster in the admin UI immediately
 *  changes where future bookings go — no code change needed. */
async function resolveNotifyEmails(date: string, timeOfDay: string): Promise<string[]> {
  const liveRep = await getLiveRepForSlot(date, timeOfDay).catch(() => null);
  if (liveRep?.emails.length) return liveRep.emails;

  const defaults = await getDefaultNotifyRecipients().catch(() => []);
  const defaultEmails = defaults.flatMap((d) => d.emails);
  if (defaultEmails.length) return defaultEmails;

  return [LAST_RESORT_NOTIFY_EMAIL];
}

export async function submitDemoRequest(input: DemoRequestInput): Promise<DemoRequestResult> {
  const fullName = input.fullName.trim();
  const businessEmail = input.businessEmail.trim().toLowerCase();
  const phone = input.phone.trim();
  const companyName = input.companyName?.trim() || null;
  const purpose = input.purpose?.trim() || null;

  if (!fullName) return { ok: false, error: "Please enter your name." };
  if (!businessEmail.includes("@")) return { ok: false, error: "Please enter a valid business email." };
  if (!input.date) return { ok: false, error: "Please pick an available date." };

  const meetingStartAt = combineDateTime(input.date, input.hour, input.minute, input.meridiem);
  if (!meetingStartAt) return { ok: false, error: "Please pick a valid time." };

  const requestedTime = `${input.hour}:${input.minute} ${input.meridiem}`;
  const formattedDate = meetingStartAt.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
  const meetingEndAt = new Date(meetingStartAt.getTime() + MEETING_DURATION_MIN * 60000);

  const admin = createAdminClient();

  // Idempotency: claim this exact booking (same visitor + same slot) by
  // inserting immediately, with placeholder calendar fields filled in only
  // after this request wins the claim. The table's UNIQUE constraint makes
  // this atomic — of two truly-simultaneous requests for the same slot, only
  // one INSERT can succeed. That winner is the only one who ever creates a
  // calendar event or sends emails; the loser just reads back the winner's
  // already-committed row. This closes the earlier race where a
  // SELECT-then-INSERT gap let two near-simultaneous requests both create
  // real provider-side calendar events for the same slot.
  const { error: claimError } = await admin.from("demo_requests").insert({
    full_name: fullName,
    business_email: businessEmail,
    phone,
    company_name: companyName,
    industry: input.industry,
    employee_count: input.employeeCount,
    monthly_revenue: input.monthlyRevenue,
    purpose,
    referral_source: input.referralSource || null,
    requested_date: input.date,
    requested_time: requestedTime,
    meeting_start_at: meetingStartAt.toISOString(),
    join_url: "",
    calendar_provider: null,
    calendar_event_id: null,
  });
  if (claimError) {
    if (claimError.code === "23505") {
      const { data: existing } = await admin
        .from("demo_requests")
        .select("join_url")
        .eq("business_email", businessEmail)
        .eq("meeting_start_at", meetingStartAt.toISOString())
        .maybeSingle();
      return { ok: true, joinUrl: (existing as { join_url: string | null } | null)?.join_url || "", formattedDate, formattedTime: requestedTime };
    }
    return { ok: false, error: claimError.message };
  }

  const timeOfDay = `${String(meetingStartAt.getHours()).padStart(2, "0")}:${String(meetingStartAt.getMinutes()).padStart(2, "0")}:00`;
  const notifyEmails = await resolveNotifyEmails(input.date, timeOfDay);

  // Try to create a real calendar event (with a real join link where the
  // provider supports one) on whichever notify email has a connected
  // calendar — detecting Google vs Microsoft vs Zoho automatically, not
  // assuming Google. Falls back to a plain placeholder link if none of them
  // are connected yet, so booking never breaks while waiting on that setup.
  // This only ever runs for the request that won the claim above, so it can
  // never create a duplicate event for the same slot.
  let joinUrl = "";
  let calendarProvider: CalProvider | null = null;
  let calendarEventId: string | null = null;
  for (const email of notifyEmails) {
    const res = await createMeetLinkForAccountEmail(email, {
      title: `Nxelio Nurture Demo — ${fullName}${companyName ? ` (${companyName})` : ""}`,
      description:
        `Demo call booked via the landing page.\n` +
        `Name: ${fullName}\n` +
        `Email: ${businessEmail}\n` +
        (companyName ? `Company: ${companyName}\n` : "") +
        (phone ? `Phone: ${phone}\n` : "") +
        (purpose ? `Notes: ${purpose}` : ""),
      startIso: meetingStartAt.toISOString(),
      endIso: meetingEndAt.toISOString(),
      attendeeEmails: [businessEmail],
    }).catch((): { ok: false; error: string } => ({ ok: false, error: "failed" }));
    if (res.ok) {
      joinUrl = res.joinUrl;
      calendarProvider = res.provider;
      calendarEventId = res.eventId;
      break;
    }
  }
  const calendarEventCreated = Boolean(calendarProvider);
  if (!joinUrl) joinUrl = generateConferenceLink("google_meet");

  const { error } = await admin
    .from("demo_requests")
    .update({ join_url: joinUrl, calendar_provider: calendarProvider, calendar_event_id: calendarEventId })
    .eq("business_email", businessEmail)
    .eq("meeting_start_at", meetingStartAt.toISOString());
  if (error) {
    return { ok: false, error: error.message };
  }

  const firstName = fullName.split(" ")[0];
  const visitorText =
    `Hi ${firstName},\n\n` +
    `Thanks for booking a demo with Nxelio Nurture! Your demo is confirmed for ${formattedDate} at ${requestedTime}.\n\n` +
    `Join here: ${joinUrl}\n\n` +
    `Looking forward to speaking with you,\nThe Nxelio Nurture Team`;
  await sendEmail({
    to: businessEmail,
    subject: `Your Nxelio Nurture demo is confirmed — ${formattedDate} at ${requestedTime}`,
    text: visitorText,
    fromName: "Nxelio Nurture",
  }).catch(() => {});

  const calendarNote = calendarEventCreated
    ? `Calendar: added to your ${PROVIDER_LABEL[calendarProvider!]} automatically.`
    : `Calendar: no calendar connected for this notification address — connect one in Settings → Calendar to auto-add future bookings.`;

  const salesText =
    `New demo request booked via the landing page.\n\n` +
    `Name: ${fullName}\n` +
    `Email: ${businessEmail}\n` +
    `Phone: ${phone || "-"}\n` +
    `Company: ${companyName || "-"}\n` +
    `Date: ${formattedDate}\n` +
    `Time: ${requestedTime}\n` +
    `Industry: ${input.industry || "-"}\n` +
    `Employees: ${input.employeeCount || "-"}\n` +
    `Monthly revenue: ${input.monthlyRevenue || "-"}\n` +
    `Purpose: ${purpose || "-"}\n` +
    `How they heard about us: ${input.referralSource || "-"}\n` +
    `Join link: ${joinUrl}\n` +
    `${calendarNote}`;

  await Promise.all(
    notifyEmails.map((to) =>
      sendEmail({
        to,
        subject: `New demo booked — ${fullName}${companyName ? ` (${companyName})` : ""}`,
        text: salesText,
        fromName: "Nxelio Nurture",
      }).catch(() => {})
    )
  );

  return { ok: true, joinUrl, formattedDate, formattedTime: requestedTime };
}
