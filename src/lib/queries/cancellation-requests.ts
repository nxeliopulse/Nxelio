"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/queries/platform-admin";
import { sendEmail } from "@/lib/email/resend";
import { stripe } from "@/lib/stripe";
import { syncSubscriptionFromStripe } from "@/lib/queries/subscriptions";
import { createZoomMeetingLink } from "@/lib/queries/zoom-accounts";
import { createGoogleMeetLink } from "@/lib/queries/calendar-accounts";
import type { PlanId, BillingInterval } from "@/lib/queries/subscriptions";
import { mapStripeStatus } from "@/lib/queries/subscription-types";
import { PLAN_CREDITS, PLAN_LEADS } from "@/lib/stripe";

import type {
  CancellationReason,
  CancellationStatus,
  CancellationRequest,
} from "@/lib/queries/cancellation-types";
import { REASON_LABELS } from "@/lib/queries/cancellation-types";

export interface SubmitCancellationInput {
  customerName?: string;
  customerEmail: string;
  planId?: string;
  reason: CancellationReason;
  feedback?: string;
  wantsMeeting: boolean;
  meetingProvider?: "zoom" | "google_meet";
  preferredDate?: string;
  preferredTime?: string;
}

// ── Customer-facing action ─────────────────────────────────────────────────────

export async function submitCancellationRequest(
  input: SubmitCancellationInput
): Promise<{ ok: boolean; ticketId?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // Resolve workspace from subscriptions (RLS scopes to current user's workspace)
  const { data: sub } = await supabase.from("subscriptions").select("workspace_id").maybeSingle();
  const workspaceId = sub?.workspace_id;
  if (!workspaceId) return { ok: false, error: "No subscription found" };

  const admin = createAdminClient();
  const { data: row, error } = await admin.from("cancellation_requests").insert({
    workspace_id: workspaceId,
    customer_name: input.customerName?.trim() || null,
    customer_email: input.customerEmail.trim().toLowerCase(),
    plan_id: input.planId || null,
    reason: input.reason,
    feedback: input.feedback?.trim() || null,
    wants_meeting: input.wantsMeeting,
    meeting_provider: input.wantsMeeting ? (input.meetingProvider ?? null) : null,
    preferred_date: input.wantsMeeting ? (input.preferredDate ?? null) : null,
    preferred_time: input.wantsMeeting ? (input.preferredTime ?? null) : null,
    status: "pending",
  }).select("id").single();

  if (error || !row) return { ok: false, error: error?.message ?? "Failed to create ticket" };

  // Email to customer
  await sendEmail({
    to: input.customerEmail,
    subject: "We've received your cancellation request",
    html: customerAcknowledgementHtml({
      name: input.customerName,
      reason: REASON_LABELS[input.reason],
      wantsMeeting: input.wantsMeeting,
      preferredDate: input.preferredDate,
      preferredTime: input.preferredTime,
      provider: input.meetingProvider,
    }),
  }).catch(() => null);

  // Email to Nxelio support
  await sendEmail({
    to: "hello@nxelio.ai",
    subject: `[Action Required] New cancellation request — ${input.customerEmail} (${input.planId ?? "unknown plan"})`,
    html: adminNotificationHtml({ input, ticketId: row.id }),
  }).catch(() => null);

  return { ok: true, ticketId: row.id };
}

// ── Admin actions ──────────────────────────────────────────────────────────────

export async function getCancellationRequests(): Promise<CancellationRequest[]> {
  if (!(await isPlatformAdmin())) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("cancellation_requests")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as CancellationRequest[]) ?? [];
}

export interface UpdateTicketPatch {
  status?: CancellationStatus;
  admin_notes?: string | null;
  retention_offer?: string | null;
  meeting_link?: string | null;
  meeting_scheduled_at?: string | null;
  resolved_at?: string | null;
}

export async function updateCancellationTicket(
  id: string,
  patch: UpdateTicketPatch
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };
  const admin = createAdminClient();
  const { error } = await admin.from("cancellation_requests").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createMeetingForTicket(
  ticketId: string
): Promise<{ ok: boolean; joinUrl?: string; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("cancellation_requests")
    .select("*")
    .eq("id", ticketId)
    .single();
  if (!ticket) return { ok: false, error: "Ticket not found" };

  const t = ticket as CancellationRequest;
  if (!t.meeting_provider) return { ok: false, error: "No meeting provider specified on this ticket" };
  if (!t.preferred_date) return { ok: false, error: "No preferred date specified" };

  const startIso = buildStartIso(t.preferred_date, t.preferred_time ?? "10:00");
  const endIso = new Date(new Date(startIso).getTime() + 30 * 60 * 1000).toISOString();
  const title = `Nxelio Retention Call — ${t.customer_email}`;

  let joinUrl: string;
  if (t.meeting_provider === "zoom") {
    const res = await createZoomMeetingLink({ title, startIso, endIso });
    if (!res.ok) return { ok: false, error: res.error };
    joinUrl = res.joinUrl;
  } else {
    const res = await createGoogleMeetLink({ title, startIso, endIso, attendeeEmails: [t.customer_email] });
    if (!res.ok) return { ok: false, error: res.error };
    joinUrl = res.joinUrl;
  }

  await admin.from("cancellation_requests").update({
    meeting_link: joinUrl,
    meeting_scheduled_at: startIso,
    status: "meeting_scheduled",
  }).eq("id", ticketId);

  // Email the customer their meeting link
  await sendEmail({
    to: t.customer_email,
    subject: "Your meeting with the Nxelio team is confirmed",
    html: meetingConfirmedHtml({ name: t.customer_name, joinUrl, preferredDate: t.preferred_date!, preferredTime: t.preferred_time }),
  }).catch(() => null);

  return { ok: true, joinUrl };
}

export async function adminCancelSubscription(
  workspaceId: string,
  cancellationRequestId?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, stripe_customer_id, plan_id, billing_interval, stripe_price_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) return { ok: false, error: "No active Stripe subscription found" };

  const stripeSub = await stripe().subscriptions.update(sub.stripe_subscription_id, {
    cancel_at_period_end: true,
  });

  // Sync the updated state back to our DB
  const item = stripeSub.items.data[0];
  if (sub.plan_id && sub.billing_interval && item) {
    await syncSubscriptionFromStripe({
      workspaceId,
      planId: sub.plan_id as PlanId,
      billingInterval: sub.billing_interval as BillingInterval,
      status: mapStripeStatus(stripeSub.status),
      creditsTotal: PLAN_CREDITS[sub.plan_id as PlanId] ?? PLAN_CREDITS.basic,
      leadsTotal: PLAN_LEADS[sub.plan_id as PlanId] ?? 0,
      currentPeriodStart: new Date(item.current_period_start * 1000),
      currentPeriodEnd: new Date(item.current_period_end * 1000),
      trialEndsAt: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
      stripeCustomerId: typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: sub.stripe_price_id ?? item.price.id,
      cancelAtPeriodEnd: true,
      canceledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
    });
  }

  if (cancellationRequestId) {
    await admin.from("cancellation_requests").update({
      status: "cancelled",
      resolved_at: new Date().toISOString(),
    }).eq("id", cancellationRequestId);
  }

  return { ok: true };
}

export interface CancellationAnalytics {
  total: number;
  pending: number;
  meeting_scheduled: number;
  retained: number;
  cancelled: number;
  follow_up_required: number;
  no_response: number;
  topReasons: { reason: CancellationReason; count: number }[];
}

export async function getCancellationAnalytics(): Promise<CancellationAnalytics> {
  if (!(await isPlatformAdmin())) {
    return { total: 0, pending: 0, meeting_scheduled: 0, retained: 0, cancelled: 0, follow_up_required: 0, no_response: 0, topReasons: [] };
  }
  const admin = createAdminClient();
  const { data } = await admin.from("cancellation_requests").select("status, reason");
  const rows = (data ?? []) as { status: CancellationStatus; reason: CancellationReason }[];

  const reasonCounts: Partial<Record<CancellationReason, number>> = {};
  const stats: CancellationAnalytics = {
    total: rows.length,
    pending: 0, meeting_scheduled: 0, retained: 0, cancelled: 0,
    follow_up_required: 0, no_response: 0,
    topReasons: [],
  };
  for (const r of rows) {
    if (r.status in stats) (stats as unknown as Record<string, number>)[r.status]++;
    reasonCounts[r.reason] = (reasonCounts[r.reason] ?? 0) + 1;
  }
  stats.topReasons = (Object.entries(reasonCounts) as [CancellationReason, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  return stats;
}

// ── Email templates ────────────────────────────────────────────────────────────

function customerAcknowledgementHtml(p: {
  name?: string;
  reason: string;
  wantsMeeting: boolean;
  preferredDate?: string;
  preferredTime?: string;
  provider?: string;
}) {
  const greeting = p.name ? `Hi ${p.name},` : "Hi there,";
  const providerLabel = p.provider === "zoom" ? "Zoom" : "Google Meet";
  const meetingLine = p.wantsMeeting
    ? `<p>You've requested a <strong>${providerLabel}</strong> call with our team on <strong>${p.preferredDate ?? "your preferred date"}</strong> at <strong>${p.preferredTime ?? "your preferred time"} UTC</strong>.</p>
       <p>Our team will review your preferred time and send you the <strong>${providerLabel} link</strong> in a separate email shortly.</p>`
    : `<p>We've received your request. A member of our team will reach out to you shortly.</p>`;
  return `
<div style="font-family:sans-serif;line-height:1.6;color:#0f172a;max-width:560px">
  <p>${greeting}</p>
  <p>We're sorry to see you go. We've received your cancellation request with the reason: <strong>${p.reason}</strong>.</p>
  ${meetingLine}
  <p>Your subscription remains <strong>active</strong> while we review your request — you won't lose access until we discuss your situation and agree on the best path forward.</p>
  <p>If you have any questions, reply to this email or contact us at <a href="mailto:support@nxelio.com">support@nxelio.com</a>.</p>
  <p>— The Nxelio Team</p>
</div>`;
}

function adminNotificationHtml(p: { input: SubmitCancellationInput; ticketId: string }) {
  const i = p.input;
  return `
<div style="font-family:sans-serif;line-height:1.6;color:#0f172a;max-width:560px">
  <h2 style="color:#dc2626">New Cancellation Request</h2>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:4px 8px;font-weight:bold;color:#475569">Ticket ID</td><td style="padding:4px 8px">${p.ticketId}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;color:#475569">Customer</td><td style="padding:4px 8px">${i.customerName ?? "—"}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;color:#475569">Email</td><td style="padding:4px 8px">${i.customerEmail}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;color:#475569">Plan</td><td style="padding:4px 8px">${i.planId ?? "—"}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;color:#475569">Reason</td><td style="padding:4px 8px">${REASON_LABELS[i.reason]}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;color:#475569">Feedback</td><td style="padding:4px 8px">${i.feedback ?? "—"}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;color:#475569">Wants Meeting</td><td style="padding:4px 8px">${i.wantsMeeting ? "Yes" : "No"}</td></tr>
    ${i.wantsMeeting ? `
    <tr><td style="padding:4px 8px;font-weight:bold;color:#475569">Provider</td><td style="padding:4px 8px">${i.meetingProvider ?? "—"}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;color:#475569">Preferred Date</td><td style="padding:4px 8px">${i.preferredDate ?? "—"}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold;color:#475569">Preferred Time</td><td style="padding:4px 8px">${i.preferredTime ?? "—"}</td></tr>
    ` : ""}
  </table>
  <p style="margin-top:16px"><a href="https://nxelio.com/admin" style="background:#2563eb;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">Open Admin Dashboard</a></p>
</div>`;
}

function meetingConfirmedHtml(p: { name: string | null; joinUrl: string; preferredDate: string; preferredTime?: string | null }) {
  const greeting = p.name ? `Hi ${p.name},` : "Hi there,";
  return `
<div style="font-family:sans-serif;line-height:1.6;color:#0f172a;max-width:560px">
  <p>${greeting}</p>
  <p>Your meeting with the Nxelio team is confirmed for <strong>${p.preferredDate}</strong>${p.preferredTime ? ` at <strong>${p.preferredTime}</strong>` : ""}.</p>
  <p><a href="${p.joinUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Join Meeting</a></p>
  <p>Or copy this link: ${p.joinUrl}</p>
  <p>We look forward to speaking with you!</p>
  <p>— The Nxelio Team</p>
</div>`;
}

function buildStartIso(date: string, time: string): string {
  return `${date}T${time}:00.000Z`;
}
