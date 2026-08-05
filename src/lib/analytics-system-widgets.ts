// Maps the ~20 legacy panels (system_key set on their analytics_reports row)
// onto real data already computed by src/lib/queries/analytics.ts. These
// panels bypass the generic report engine (runReport) entirely — some
// because they're row-level lists rather than aggregates, some because they
// need a data shape (a 2D heatmap grid, a radar's per-axis points, a
// scatter's x/y/z triples) the generic ReportResultRow contract doesn't
// cover. No fabricated data: every field pulled here already exists on
// AnalyticsStats/DashboardStats, computed from real Supabase rows.
import type { AnalyticsStats, DashboardStats } from "@/lib/queries/analytics";
import type { ReportResultRow } from "@/lib/analytics-reports";

export interface AlertItem {
  type: "positive" | "info" | "attention" | "warning";
  title: string;
  body: string;
  recommendation: string;
}

export type SystemWidgetData =
  | { kind: "generic"; rows: ReportResultRow[]; tableColumns?: { key: string; label: string }[] }
  | { kind: "heatmap"; grid: number[][] }
  | { kind: "radar"; points: { axis: string; value: number }[] }
  | { kind: "scatter"; points: { x: number; y: number; z: number; name: string }[] }
  | { kind: "alerts"; items: AlertItem[] };

/** The deterministic threshold rules the old page called "AI Predictive
 *  Insights" — real, useful signal, just mislabeled. Ported here verbatim
 *  (logic unchanged) minus the "AI" framing; see src/lib/queries/analytics.ts
 *  for the AnalyticsStats fields this reads. */
function computeThresholdAlerts(s: AnalyticsStats): AlertItem[] {
  const items: AlertItem[] = [];

  if (s.quotaAttainment >= 85) {
    items.push({
      type: "positive",
      title: `High quota attainment (${s.quotaAttainment}%)`,
      body: "Won revenue this period is tracking ahead of the target quota.",
      recommendation: "Consider raising next cycle's target or reallocating budget toward the top-performing pipeline.",
    });
  } else {
    items.push({
      type: "warning",
      title: `Quota gap (${s.quotaAttainment}% attained)`,
      body: `Won revenue is trailing target quota — average deal velocity is ${s.dealVelocity} days.`,
      recommendation: "Review open deals in later stages for stalled follow-up.",
    });
  }

  items.push({
    type: "attention",
    title: `Opportunity aging (${s.dealVelocity}d avg)`,
    body: "Some open deals have been sitting without a stage change for a while.",
    recommendation: "Check the Pipeline dashboard's aging breakdown for deals stalled longest.",
  });

  if (s.hotLeads > 0) {
    items.push({
      type: "positive",
      title: `${s.hotLeads} hot lead${s.hotLeads === 1 ? "" : "s"}`,
      body: `${s.hotLeads} lead${s.hotLeads === 1 ? " is" : "s are"} marked "Hot" right now.`,
      recommendation: "Prioritize outreach to these before they cool off.",
    });
  }

  const topCampaign = [...s.campaignPerf].sort((a, b) => b.openRate - a.openRate)[0];
  if (topCampaign) {
    items.push({
      type: "info",
      title: `Best-performing campaign: ${topCampaign.name}`,
      body: `${topCampaign.openRate}% open rate, ${topCampaign.replyRate}% reply rate.`,
      recommendation: "Reuse this subject line/timing pattern for upcoming campaigns.",
    });
  }

  return items.slice(0, 4);
}

export function getSystemWidgetData(
  systemKey: string,
  stats: AnalyticsStats,
  dashboardStats: DashboardStats
): SystemWidgetData {
  switch (systemKey) {
    case "ov-combo":
    case "rv-forecast":
      return {
        kind: "generic",
        rows: stats.forecastMonths.map((m) => ({ label: m.month, value: m.actual, value2: m.quota })),
      };

    case "ov-leads":
      return {
        kind: "generic",
        rows: dashboardStats.hotLeadAlerts.map((l) => ({ label: l.name, value: l.score, meta: { company: l.company } })),
        tableColumns: [
          { key: "label", label: "Name" },
          { key: "company", label: "Company" },
          { key: "value", label: "Score" },
        ],
      };

    case "ov-opps":
    case "pi-opps":
      return {
        kind: "generic",
        rows: stats.topOpportunities.map((o) => ({ label: o.name, value: o.value, meta: { stage: o.stage, daysOpen: o.daysOpen } })),
        tableColumns: [
          { key: "label", label: "Deal" },
          { key: "stage", label: "Stage" },
          { key: "value", label: "Value" },
          { key: "daysOpen", label: "Days Open" },
        ],
      };

    case "ov-insights":
      return { kind: "alerts", items: computeThresholdAlerts(stats) };

    case "ov-activity":
      return {
        kind: "generic",
        rows: dashboardStats.recentActivities.map((a) => ({ label: a.lead, value: 0, meta: { action: a.action, time: a.time } })),
        tableColumns: [
          { key: "label", label: "Lead" },
          { key: "action", label: "Activity" },
          { key: "time", label: "When" },
        ],
      };

    case "pi-aging":
      return { kind: "generic", rows: stats.opportunityAging.map((a) => ({ label: a.bucket, value: a.count })) };

    case "rv-winloss":
      return {
        kind: "generic",
        rows: stats.winLossReasons.map((r) => ({ label: r.reason, value: r.won, meta: { lost: r.lost } })),
        tableColumns: [
          { key: "label", label: "Reason" },
          { key: "value", label: "Won" },
          { key: "lost", label: "Lost" },
        ],
      };

    case "rv-sources":
      return { kind: "generic", rows: stats.leadSources.map((s) => ({ label: s.source, value: s.leads })) };

    case "ca-radar":
      return { kind: "radar", points: stats.leadSources.map((s) => ({ axis: s.source, value: s.leads })) };

    case "ca-scatter":
      return {
        kind: "scatter",
        points: stats.campaignPerf.map((c) => ({ x: c.openRate, y: c.replyRate, z: Math.max(c.sent, 1), name: c.name })),
      };

    case "ca-stacked":
      return {
        kind: "generic",
        rows: stats.engagement.map((e) => ({ label: e.day, value: e.opens, meta: { clicks: e.clicks, replies: e.replies } })),
        tableColumns: [
          { key: "label", label: "Day" },
          { key: "value", label: "Opens" },
          { key: "clicks", label: "Clicks" },
          { key: "replies", label: "Replies" },
        ],
      };

    case "ac-heatmap":
      return { kind: "heatmap", grid: stats.heatmap };

    case "ac-pie":
    case "aa-mix":
      return { kind: "generic", rows: stats.activityBreakdown.map((a) => ({ label: a.label, value: a.count })) };

    case "ac-trend":
      return { kind: "generic", rows: stats.engagement.map((e) => ({ label: e.day, value: e.opens })) };

    case "ac-bars":
      return { kind: "generic", rows: stats.activityBreakdown.map((a) => ({ label: a.label, value: a.count })) };

    case "aa-health":
      return { kind: "generic", rows: stats.accountHealthDist.map((a) => ({ label: a.bucket, value: a.count })) };

    case "aa-score":
      return { kind: "generic", rows: stats.leadScoreDist.map((a) => ({ label: a.bucket, value: a.count })) };

    default:
      return { kind: "generic", rows: [] };
  }
}
