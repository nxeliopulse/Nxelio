import type { ProactiveSignal, ProactiveSnapshot } from "@/lib/ai/proactive/types";

const DAY_MS = 86_400_000;
const INACTIVE_DAYS = 30;
const STAGNANT_DAYS = 30;
const REMINDER_DAYS = 7;

function ageInDays(iso: string | null, now: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now - Date.parse(iso)) / DAY_MS);
}

function daysUntil(iso: string | null, now: number): number | null {
  if (!iso) return null;
  return (Date.parse(iso) - now) / DAY_MS;
}

export function detectProactiveSignals(snapshot: ProactiveSnapshot, now = Date.now()): ProactiveSignal[] {
  const signals: ProactiveSignal[] = [];

  for (const campaign of snapshot.campaigns) {
    if (campaign.sent >= 20 && campaign.openRate < 20) {
      signals.push({
        fingerprint: `campaign_performance_drop:${campaign.id}`,
        kind: "campaign_performance_drop",
        severity: "warning",
        title: `Campaign engagement is low: ${campaign.name}`,
        message: `${campaign.name} has a ${campaign.openRate}% open rate after ${campaign.sent} sends.`,
        recommendation: "Review the subject line, audience, and send timing. Any campaign change still requires approval.",
        link: `/campaigns/${campaign.id}`,
        entityId: campaign.id,
        metadata: { campaign_id: campaign.id, open_rate: campaign.openRate, sent: campaign.sent },
      });
    }
    if (campaign.sent >= 20 && campaign.bounceRate >= 5) {
      signals.push({
        fingerprint: `email_bounce_increase:${campaign.id}`,
        kind: "email_bounce_increase",
        severity: "critical",
        title: `Bounce rate increased: ${campaign.name}`,
        message: `${campaign.name} has a ${campaign.bounceRate}% bounce rate across ${campaign.sent} sends.`,
        recommendation: "Pause further sends, review suppressed addresses, and verify the audience before approving more outreach.",
        link: `/campaigns/${campaign.id}`,
        entityId: campaign.id,
        metadata: { campaign_id: campaign.id, bounce_rate: campaign.bounceRate, sent: campaign.sent },
      });
    }
  }

  const inactive = snapshot.leads.filter((lead) => lead.status?.toLowerCase() !== "converted" && ageInDays(lead.lastActivityAt, now) >= INACTIVE_DAYS);
  if (inactive.length >= 5) {
    signals.push({
      fingerprint: "inactive_leads:workspace",
      kind: "inactive_leads",
      severity: "warning",
      title: `${inactive.length} leads have gone quiet`,
      message: `${inactive.slice(0, 3).map((lead) => lead.name).join(", ")}${inactive.length > 3 ? " and more" : ""} have had no activity for 30+ days.`,
      recommendation: "Review the inactive leads and prepare a re-engagement sequence. Sending it requires approval.",
      link: "/leads",
      metadata: { count: inactive.length, threshold_days: INACTIVE_DAYS },
    });
  }

  const stagnant = snapshot.opportunities.filter((opportunity) => !["won", "lost"].includes(opportunity.stage) && ageInDays(opportunity.updatedAt, now) >= STAGNANT_DAYS);
  if (stagnant.length >= 2) {
    signals.push({
      fingerprint: "pipeline_stagnation:workspace",
      kind: "pipeline_stagnation",
      severity: "warning",
      title: "Pipeline movement has slowed",
      message: `${stagnant.length} open opportunities have not changed for 30+ days.`,
      recommendation: "Review the stalled opportunities, assign next steps, and update stages only after confirmation.",
      link: "/opportunities",
      metadata: { count: stagnant.length, threshold_days: STAGNANT_DAYS },
    });
  }

  if (snapshot.overdueFollowups > 0) {
    signals.push({
      fingerprint: "missing_followups:workspace",
      kind: "missing_followups",
      severity: "warning",
      title: "Follow-ups are overdue",
      message: `${snapshot.overdueFollowups} scheduled follow-up${snapshot.overdueFollowups === 1 ? " is" : "s are"} more than 24 hours overdue.`,
      recommendation: "Check the campaign queue and lead suppression status before approving a retry or reschedule.",
      link: "/campaigns",
      metadata: { count: snapshot.overdueFollowups },
    });
  }

  if (snapshot.creditsRemaining !== null && snapshot.creditsTotal && snapshot.creditsTotal > 0) {
    const ratio = snapshot.creditsRemaining / snapshot.creditsTotal;
    if (ratio <= 0.2) {
      signals.push({
        fingerprint: "credit_usage:workspace",
        kind: "credit_usage",
        severity: ratio <= 0.05 ? "critical" : "warning",
        title: "AI credits are running low",
        message: `${snapshot.creditsRemaining} of ${snapshot.creditsTotal} AI credits remain this cycle.`,
        recommendation: "Review recent AI usage and consider an upgrade before starting another large workflow.",
        link: "/billing",
        metadata: { credits_remaining: snapshot.creditsRemaining, credits_total: snapshot.creditsTotal },
      });
    }
  }

  const subscriptionDate = snapshot.trialEnd || snapshot.currentPeriodEnd;
  const daysLeft = daysUntil(subscriptionDate, now);
  if (snapshot.subscriptionStatus === "past_due" || snapshot.subscriptionStatus === "canceled") {
    signals.push({
      fingerprint: "subscription_reminder:workspace",
      kind: "subscription_reminder",
      severity: snapshot.subscriptionStatus === "past_due" ? "critical" : "warning",
      title: snapshot.subscriptionStatus === "past_due" ? "Subscription payment needs attention" : "Subscription is canceled",
      message: `The workspace subscription is ${snapshot.subscriptionStatus}.`,
      recommendation: "Review billing before starting workflows that depend on paid features.",
      link: "/billing",
      metadata: { status: snapshot.subscriptionStatus },
    });
  } else if (daysLeft !== null && daysLeft >= 0 && daysLeft <= REMINDER_DAYS) {
    signals.push({
      fingerprint: "subscription_reminder:workspace",
      kind: "subscription_reminder",
      severity: "info",
      title: "Subscription renewal is coming up",
      message: `The current billing period ends in ${Math.ceil(daysLeft)} day${Math.ceil(daysLeft) === 1 ? "" : "s"}.`,
      recommendation: "Review the plan and renewal details in Billing.",
      link: "/billing",
      metadata: { days_left: Math.ceil(daysLeft), status: snapshot.subscriptionStatus },
    });
  }

  return signals;
}
