import test from "node:test";
import assert from "node:assert/strict";
import { detectProactiveSignals } from "../src/lib/ai/proactive/detector.ts";

const now = Date.parse("2026-08-07T00:00:00.000Z");
const old = "2026-06-01T00:00:00.000Z";

test("detects campaign, inactivity, pipeline, follow-up, credit, and billing risks", () => {
  const signals = detectProactiveSignals({
    campaigns: [{ id: "c1", name: "Launch", sent: 100, openRate: 12, replyRate: 1, bounceRate: 7 }],
    leads: Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, name: `Lead ${i}`, status: "New", lastActivityAt: old })),
    opportunities: [
      { id: "o1", name: "Deal 1", stage: "proposal_sent", updatedAt: old },
      { id: "o2", name: "Deal 2", stage: "negotiation", updatedAt: old },
    ],
    overdueFollowups: 2,
    creditsRemaining: 10,
    creditsTotal: 100,
    subscriptionStatus: "active",
    currentPeriodEnd: "2026-08-10T00:00:00.000Z",
    trialEnd: null,
  }, now);

  assert.deepEqual(new Set(signals.map((signal) => signal.kind)), new Set([
    "campaign_performance_drop", "email_bounce_increase", "inactive_leads",
    "pipeline_stagnation", "missing_followups", "credit_usage", "subscription_reminder",
  ]));
});

test("does not alert on healthy or closed records", () => {
  const signals = detectProactiveSignals({
    campaigns: [{ id: "c1", name: "Healthy", sent: 100, openRate: 45, replyRate: 10, bounceRate: 1 }],
    leads: [{ id: "l1", name: "Active Lead", status: "Hot", lastActivityAt: "2026-08-06T00:00:00.000Z" }],
    opportunities: [{ id: "o1", name: "Won Deal", stage: "won", updatedAt: old }],
    overdueFollowups: 0,
    creditsRemaining: 90,
    creditsTotal: 100,
    subscriptionStatus: "active",
    currentPeriodEnd: "2026-09-01T00:00:00.000Z",
    trialEnd: null,
  }, now);
  assert.equal(signals.length, 0);
});
