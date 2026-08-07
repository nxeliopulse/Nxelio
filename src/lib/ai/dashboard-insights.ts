import type { DashboardStats } from "@/lib/queries/analytics";

export interface DashboardRiskAlert {
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  recommendation: string;
  link: string;
}

export interface AiDashboardSummary {
  generatedAt: string;
  morningBrief: string;
  dailySummary: string;
  weeklySummary: string;
  pipelineSummary: string[];
  revenueInsights: string[];
  leadInsights: string[];
  campaignInsights: string[];
  riskAlerts: DashboardRiskAlert[];
  recommendations: string[];
}

function signed(value: number | null | undefined): string {
  if (value === null || value === undefined) return "no comparison available";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function buildAiDashboardSummary(stats: DashboardStats, alerts: DashboardRiskAlert[] = [], generatedAt = new Date().toISOString()): AiDashboardSummary {
  const latestLeads = stats.leadGrowth[stats.leadGrowth.length - 1]?.leads ?? 0;
  const previousLeads = stats.leadGrowth[stats.leadGrowth.length - 2]?.leads ?? 0;
  const topCampaign = [...stats.campaignPerf].sort((a, b) => b.openRate - a.openRate)[0];
  const topSource = stats.trafficSources[0];
  const pipelineValue = Math.round(stats.pipeline.openValue).toLocaleString("en-US");
  const wonValue = Math.round(stats.pipeline.wonValue).toLocaleString("en-US");

  const pipelineSummary = [
    `${stats.pipeline.openCount} open opportunities represent $${pipelineValue} in pipeline.`,
    `${stats.pipeline.wonCount} deals are won, worth $${wonValue}; the current win rate is ${stats.pipeline.winRate}%.`,
    stats.dealsOverview.pendingCount > 0
      ? `${stats.dealsOverview.pendingCount} deals are still pending confirmation.`
      : "There are no deals waiting for closing confirmation.",
  ];

  const revenueInsights = [
    `Revenue won this period is $${wonValue}.`,
    `Revenue is ${signed(stats.revenueTrendPct)} versus the previous month.`,
    `The open pipeline is ${stats.pipeline.openCount > 0 ? "active" : "empty"}; focus on moving the next qualified opportunity forward.`,
  ];

  const leadInsights = [
    `${stats.totalLeads.toLocaleString("en-US")} prospects are in the workspace, including ${stats.hotLeads} hot leads.`,
    `Conversion is ${stats.conversionRate}%; lead volume changed ${signed(stats.leadsDelta)} month over month.`,
    topSource ? `${topSource.name} is the largest acquisition source at ${topSource.value}%.` : "There is not enough source data for a channel comparison.",
  ];

  const campaignInsights = [
    `${stats.snapshot.emailsSent.toLocaleString("en-US")} emails have been sent and the average open rate is ${stats.avgOpenRate}%.`,
    topCampaign ? `${topCampaign.name} is currently the strongest campaign at ${topCampaign.openRate}% opens and ${topCampaign.replyRate}% replies.` : "There is not enough campaign data for a performance comparison.",
    stats.snapshot.repliesReceived > 0 ? `${stats.snapshot.repliesReceived} inbound replies are recorded.` : "No inbound replies are recorded in the current snapshot.",
  ];

  const recommendations = [
    ...(stats.hotLeads > 0 ? [`Prioritize the ${stats.hotLeads} hot lead${stats.hotLeads === 1 ? "" : "s"} before they cool off.`] : []),
    ...(stats.pipeline.openCount > 0 ? ["Review the next step for the highest-value open opportunity."] : []),
    ...(stats.avgOpenRate < 20 && stats.snapshot.emailsSent > 0 ? ["Review campaign subjects and audience quality before approving more sends."] : []),
    ...(alerts.length > 0 ? ["Resolve the highest-severity workspace alert before starting a new automated workflow."] : []),
  ].slice(0, 4);

  return {
    generatedAt,
    morningBrief: `You have ${stats.totalLeads.toLocaleString("en-US")} prospects, ${stats.hotLeads} hot leads, and $${pipelineValue} in open pipeline. ${alerts.length ? `${alerts.length} risk signal${alerts.length === 1 ? " is" : "s are"} ready for review.` : "No proactive risk signals are active."}`,
    dailySummary: `${stats.recentActivities.length} recent workspace activities are visible. ${latestLeads > previousLeads ? "Lead volume is moving up" : latestLeads < previousLeads ? "Lead volume is softer" : "Lead volume is steady"} in the latest period.`,
    weeklySummary: `Revenue is ${signed(stats.revenueTrendPct)} month over month, conversion is ${stats.conversionRate}%, and ${stats.pipeline.openCount} opportunities remain open.`,
    pipelineSummary,
    revenueInsights,
    leadInsights,
    campaignInsights,
    riskAlerts: alerts.slice(0, 5),
    recommendations: recommendations.length ? recommendations : ["Keep monitoring the workspace as new activity arrives."],
  };
}
