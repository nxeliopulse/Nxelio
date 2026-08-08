import test from "node:test";
import assert from "node:assert/strict";
import { buildAiDashboardSummary } from "../src/lib/ai/dashboard-insights.ts";

const stats = {
  totalLeads: 120, hotLeads: 7, avgOpenRate: 18, conversionRate: 4.5,
  leadGrowth: [{ date: "Jun", leads: 8, hot: 1 }, { date: "Jul", leads: 12, hot: 2 }],
  campaignPerf: [{ name: "Launch", openRate: 42, replyRate: 8 }],
  recentActivities: [{ id: "1", lead: "A", action: "Email", type: "email", time: "today" }],
  hotLeadAlerts: [], leadsDelta: 50,
  snapshot: { emailsSent: 400, repliesReceived: 12, hotLeads: 7, aiScored: 80 },
  pipeline: { openValue: 250000, openCount: 4, wonValue: 50000, wonCount: 2, winRate: 33.3 },
  campaignTypes: { campaigns: 2, newsletters: 1, segments: 3, workflows: 1 },
  revenueSeries: { weekly: [], monthly: [], yearly: [] }, trafficSources: [{ name: "Referral", value: 60, count: 72 }],
  pipelineBuckets: [], dealsOverview: { successfulCount: 2, successfulValue: 50000, pendingCount: 1, pendingValue: 25000, rejectedCount: 1, rejectedValue: 5000 },
  contactsSparkline: [], revenueTrendPct: 12.5, conversionTrendPct: 4,
  teamPerformance: [],
};

test("builds dynamic summaries from real dashboard values", () => {
  const summary = buildAiDashboardSummary(stats, [{ severity: "warning", title: "Pipeline risk", message: "Two deals stalled.", recommendation: "Review them.", link: "/opportunities" }], "2026-08-07T00:00:00.000Z");
  assert.match(summary.morningBrief, /120 prospects/);
  assert.match(summary.pipelineSummary[0], /\$250,000/);
  assert.match(summary.campaignInsights[1], /Launch/);
  assert.equal(summary.riskAlerts.length, 1);
  assert.match(summary.recommendations.join(" "), /highest-severity/);
  assert.equal(summary.generatedAt, "2026-08-07T00:00:00.000Z");
});

test("keeps a useful recommendation when no risks exist", () => {
  const summary = buildAiDashboardSummary({ ...stats, hotLeads: 0, pipeline: { ...stats.pipeline, openCount: 0 }, avgOpenRate: 40 }, []);
  assert.deepEqual(summary.riskAlerts, []);
  assert.equal(summary.recommendations.length, 1);
});
