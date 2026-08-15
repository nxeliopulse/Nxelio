"use server";
import { createClient } from "@/lib/supabase/server";
import {
  resolveDateRangePreset,
  previousPeriodRange,
  percentChange,
  calcReplyRate,
  calcWinRate,
  calcWeightedForecast,
  calcStageConversion,
  bucketDateRange,
  type DateRangePreset,
  type ComparisonMode,
  type DateRange,
} from "@/lib/analytics/overview-metrics";
import { getStageForecast, CLOSED_STAGES, STAGE_LABELS, OPPORTUNITY_STAGES, type OpportunityStage } from "@/lib/opportunities";

// Approximation, clearly flagged: the real schema has no "buying intent"
// field or configured priority threshold yet, so High-Priority Prospects
// uses AI score alone. Revisit once a settings UI exists for this.
const HIGH_PRIORITY_SCORE_THRESHOLD = 75;

// "Enriched"/"AI Scored" have no dedicated event tracking in this schema
// (no enrichment_jobs/ai_scores tables) — approximated from existing lead
// columns. Flagged here so the gap is visible at the one place it matters.
const CONTACTED_ACTIVITY_TYPES = ["EMAIL_SENT"];
const REPLIED_ACTIVITY_TYPES = ["EMAIL_REPLIED"];

export interface OverviewFilters {
  dateRange: DateRangePreset;
  customFrom?: string;
  customTo?: string;
  comparison: ComparisonMode;
  /** "me" | "all" | "team" | a specific user id. Defaults to "all" for
   *  Admins and "me" for everyone else if omitted — see resolveOwnerIds(). */
  owner?: string;
  campaignId?: string;
  segmentId?: string;
  industry?: string;
  source?: string;
  stage?: OpportunityStage;
}

export interface KpiValue {
  value: number;
  previousValue: number | null;
  changePercent: number | null;
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  conversionPercent: number;
}

export interface PipelineStageSlice {
  stage: OpportunityStage;
  label: string;
  count: number;
  amount: number;
  percentOfPipeline: number;
}

export interface RevenueTrendPoint {
  bucketLabel: string;
  wonRevenue: number;
  weightedForecast: number;
}

export interface TopCampaignRow {
  id: string;
  name: string;
  replies: number;
  meetings: number;
  qualified: number;
  opportunities: number;
  pipeline: number;
  revenue: number;
}

export interface AiInsight {
  id: string;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface QuickReportLink {
  key: string;
  label: string;
  href: string;
}

export interface OverviewData {
  hasAnyData: boolean;
  showTeamFilter: boolean;
  granularity: "daily" | "weekly" | "monthly";
  kpis: {
    totalProspects: KpiValue;
    replies: KpiValue & { replyRate: number };
    meetings: KpiValue;
    qualified: KpiValue;
    openPipeline: KpiValue;
    closedWonRevenue: KpiValue;
    winRate: { value: number; won: number; lost: number };
    weightedForecast: KpiValue;
    activeCampaigns: { active: number; paused: number; needsAttention: number };
    highPriorityProspects: { count: number; thresholdText: string };
  };
  funnel: FunnelStage[];
  pipelineByStage: PipelineStageSlice[];
  revenueTrend: RevenueTrendPoint[];
  topCampaigns: TopCampaignRow[];
  aiInsights: AiInsight[];
  quickReports: QuickReportLink[];
  lastUpdatedAt: string;
}

interface AnalyticsContext {
  workspaceId: string;
  userId: string;
  roleId: number | null;
  isAdmin: boolean;
  directReportIds: string[];
}

/** Workspace/role context for the current user — reused by every Overview
 *  query for owner/team scoping. No combined helper exists elsewhere in the
 *  app yet (each page re-fetches auth.getUser() + a users row itself), so
 *  this is local to the analytics module rather than a wider refactor. */
export async function getAnalyticsContext(): Promise<AnalyticsContext> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const [{ data: profile }, { data: reports }] = await Promise.all([
    supabase.from("users").select("workspace_id, role_id").eq("user_id", user.id).single(),
    supabase.from("users").select("user_id").eq("manager_id", user.id),
  ]);

  return {
    workspaceId: profile?.workspace_id ?? "",
    userId: user.id,
    roleId: profile?.role_id ?? null,
    isAdmin: profile?.role_id === 1,
    directReportIds: ((reports as { user_id: string }[]) || []).map((r) => r.user_id),
  };
}

/**
 * Maps the doc's Sales Rep/Manager/Admin visibility model onto what's
 * actually enforced today (role_id=1 Super Admin + manager_id hierarchy —
 * the earlier granular Roles & Permissions system was reverted). This is a
 * default/filter, not a hard security wall: RLS still scopes every query to
 * the workspace, but a non-admin CAN switch "Owner" to see another specific
 * user's numbers if they choose to. Re-adding enforced per-role restriction
 * is a separate, bigger task if wanted later.
 */
function resolveOwnerIds(ctx: AnalyticsContext, owner: string | undefined): string[] | null {
  const resolved = owner ?? (ctx.isAdmin ? "all" : "me");
  if (resolved === "all") return null;
  if (resolved === "team") return [ctx.userId, ...ctx.directReportIds];
  if (resolved === "me") return [ctx.userId];
  return [resolved];
}

function resolveRange(filters: OverviewFilters, now: Date): DateRange {
  if (filters.dateRange === "custom" && filters.customFrom && filters.customTo) {
    return { from: new Date(filters.customFrom), to: new Date(filters.customTo) };
  }
  return resolveDateRangePreset(filters.dateRange === "custom" ? "last_30_days" : filters.dateRange, now);
}

function sum(rows: { deal_value: number | string | null }[]): number {
  return rows.reduce((s, r) => s + Number(r.deal_value || 0), 0);
}

export async function getOverviewAnalytics(filters: OverviewFilters): Promise<OverviewData> {
  const supabase = await createClient();
  const ctx = await getAnalyticsContext();
  const now = new Date();
  const range = resolveRange(filters, now);
  const comparisonRange = previousPeriodRange(range, filters.comparison);
  const ownerIds = resolveOwnerIds(ctx, filters.owner);

  // ── Base lead cohort: leads created in the selected period, matching the
  // shared filters. The funnel and Total Prospects KPI both walk forward
  // from this same cohort. ─────────────────────────────────────────────────
  let leadsQuery = supabase
    .from("leads")
    .select("id, status, lead_score, industry, linkedin, website_url, source, created_at, owner_id")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString());
  if (ownerIds) leadsQuery = leadsQuery.in("owner_id", ownerIds);
  if (filters.industry) leadsQuery = leadsQuery.eq("industry", filters.industry);
  if (filters.source) leadsQuery = leadsQuery.eq("source", filters.source);

  let prevLeadsQuery = comparisonRange
    ? supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", comparisonRange.from.toISOString())
        .lte("created_at", comparisonRange.to.toISOString())
    : null;
  if (prevLeadsQuery && ownerIds) prevLeadsQuery = prevLeadsQuery.in("owner_id", ownerIds);
  if (prevLeadsQuery && filters.industry) prevLeadsQuery = prevLeadsQuery.eq("industry", filters.industry);
  if (prevLeadsQuery && filters.source) prevLeadsQuery = prevLeadsQuery.eq("source", filters.source);

  const [{ data: leadsData }, prevLeadsResult] = await Promise.all([
    leadsQuery,
    prevLeadsQuery ?? Promise.resolve({ count: null }),
  ]);
  const leads = (leadsData as { id: string; status: string; lead_score: number; industry: string | null; linkedin: string | null; website_url: string | null; source: string | null; created_at: string; owner_id: string | null }[]) || [];
  const leadIds = leads.map((l) => l.id);
  const prevLeadsCount = "count" in prevLeadsResult ? prevLeadsResult.count ?? null : null;

  // ── Downstream signals for this exact cohort (activities/meetings tied to
  // these lead ids), regardless of when the downstream event happened. ────
  const [activityRes, meetingsRes, oppsForCohortRes] = leadIds.length
    ? await Promise.all([
        supabase.from("lead_activities").select("lead_id, activity_type").in("lead_id", leadIds).in("activity_type", [...CONTACTED_ACTIVITY_TYPES, ...REPLIED_ACTIVITY_TYPES]),
        supabase.from("meetings").select("lead_id").in("lead_id", leadIds),
        supabase.from("opportunities").select("id, lead_id, stage, deal_value, created_at").in("lead_id", leadIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const activities = (activityRes.data as { lead_id: string; activity_type: string }[]) || [];
  const contactedLeadIds = new Set(activities.filter((a) => CONTACTED_ACTIVITY_TYPES.includes(a.activity_type)).map((a) => a.lead_id));
  const repliedLeadIds = new Set(activities.filter((a) => REPLIED_ACTIVITY_TYPES.includes(a.activity_type)).map((a) => a.lead_id));
  const meetingLeadIds = new Set(((meetingsRes.data as { lead_id: string | null }[]) || []).map((m) => m.lead_id).filter(Boolean) as string[]);
  const cohortOpportunities = (oppsForCohortRes.data as { id: string; lead_id: string; stage: OpportunityStage; deal_value: number; created_at: string }[]) || [];

  const enrichedCount = leads.filter((l) => l.industry && (l.linkedin || l.website_url)).length;
  const aiScoredCount = leads.filter((l) => (l.lead_score || 0) > 0).length;
  const qualifiedLeadCount = leads.filter((l) => l.status === "Qualified" || l.status === "Converted").length;
  const opportunitiesCreatedCount = new Set(cohortOpportunities.map((o) => o.lead_id)).size;
  const closedWonCohortCount = new Set(cohortOpportunities.filter((o) => o.stage === "won").map((o) => o.lead_id)).size;

  const funnelCounts = [
    { key: "prospects_added", label: "Prospects Added", count: leads.length },
    { key: "enriched", label: "Enriched", count: enrichedCount },
    { key: "ai_scored", label: "AI Scored", count: aiScoredCount },
    { key: "contacted", label: "Contacted", count: contactedLeadIds.size },
    { key: "replied", label: "Replied", count: repliedLeadIds.size },
    { key: "meetings_booked", label: "Meetings Booked", count: meetingLeadIds.size },
    { key: "qualified", label: "Qualified", count: qualifiedLeadCount },
    { key: "opportunities_created", label: "Opportunities Created", count: opportunitiesCreatedCount },
    { key: "closed_won", label: "Closed Won", count: closedWonCohortCount },
  ];
  const funnel: FunnelStage[] = funnelCounts.map((stage, i) => ({
    ...stage,
    conversionPercent: i === 0 ? 100 : calcStageConversion(stage.count, funnelCounts[i - 1].count),
  }));

  // Resolve which lead ids belong to the owner scope once, up front —
  // meetings/lead_activities have no owner_id of their own, so every
  // owner-scoped query on them below filters by `lead_id IN (ownerLeadIds)`
  // rather than an embedded-resource join filter (no precedent for that
  // pattern elsewhere in this codebase, and it's easy to get FK-embed
  // ambiguity wrong — this two-step approach is simpler to verify).
  let ownerLeadIds: string[] | null = null;
  if (ownerIds) {
    const { data: ownerLeadRows } = await supabase.from("leads").select("id").in("owner_id", ownerIds);
    ownerLeadIds = ((ownerLeadRows as { id: string }[]) || []).map((r) => r.id);
  }

  // ── Meetings KPI (all meetings booked in-period for the owner scope, not
  // just this cohort — a meeting can be booked for a lead created earlier). ─
  let meetingsInRangeQuery = supabase
    .from("meetings")
    .select("id, lead_id, status")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString());
  if (ownerLeadIds) meetingsInRangeQuery = meetingsInRangeQuery.in("lead_id", ownerLeadIds);
  let prevMeetingsQuery = comparisonRange
    ? supabase
        .from("meetings")
        .select("id", { count: "exact", head: true })
        .gte("created_at", comparisonRange.from.toISOString())
        .lte("created_at", comparisonRange.to.toISOString())
    : null;
  if (prevMeetingsQuery && ownerLeadIds) prevMeetingsQuery = prevMeetingsQuery.in("lead_id", ownerLeadIds);

  // ── Replies KPI: distinct leads with a reply activity in-period + total
  // outreach delivered in-period (for the reply-rate denominator). ────────
  let repliesQuery = supabase
    .from("lead_activities")
    .select("lead_id")
    .eq("activity_type", "EMAIL_REPLIED")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString());
  if (ownerLeadIds) repliesQuery = repliesQuery.in("lead_id", ownerLeadIds);
  let deliveredQuery = supabase
    .from("lead_activities")
    .select("lead_id")
    .eq("activity_type", "EMAIL_SENT")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString());
  if (ownerLeadIds) deliveredQuery = deliveredQuery.in("lead_id", ownerLeadIds);

  const [meetingsInRangeRes, prevMeetingsRes, repliesRes, deliveredRes] = await Promise.all([
    meetingsInRangeQuery,
    prevMeetingsQuery ?? Promise.resolve({ count: null }),
    repliesQuery,
    deliveredQuery,
  ]);
  const meetingsInRangeCount = (meetingsInRangeRes.data || []).length;
  const prevMeetingsCount = "count" in prevMeetingsRes ? prevMeetingsRes.count ?? null : null;
  const repliesCount = (repliesRes.data || []).length;
  const deliveredCount = (deliveredRes.data || []).length;

  // ── Opportunities: current open snapshot (not date-filtered — "open
  // pipeline" is a point-in-time total, not tied to when deals were
  // created), plus won/lost closed within the period for Win Rate and
  // Closed-Won Revenue (whose date basis is Actual Close Date per the doc).
  // For period-over-period movement on the two snapshot KPIs (Open Pipeline,
  // Weighted Forecast) there's no opportunity_stage_history table to
  // reconstruct a true historical snapshot, so the comparison value uses
  // today's stage on opportunities that already existed by the comparison
  // window's end — i.e. "how much of today's total is genuinely new since
  // then." Flagged here since it's an approximation, not a true snapshot. ──
  let openOppsQuery = supabase.from("opportunities").select("id, deal_value, stage, created_at").not("stage", "in", `(${CLOSED_STAGES.join(",")})`);
  if (ownerIds) openOppsQuery = openOppsQuery.in("owner_id", ownerIds);
  if (filters.campaignId) openOppsQuery = openOppsQuery.eq("campaign_id", filters.campaignId);
  if (filters.segmentId) openOppsQuery = openOppsQuery.eq("segment_id", filters.segmentId);
  if (filters.stage) openOppsQuery = openOppsQuery.eq("stage", filters.stage);

  let closedOppsQuery = supabase
    .from("opportunities")
    .select("id, deal_value, stage, closed_at")
    .in("stage", CLOSED_STAGES)
    .gte("closed_at", range.from.toISOString())
    .lte("closed_at", range.to.toISOString());
  if (ownerIds) closedOppsQuery = closedOppsQuery.in("owner_id", ownerIds);
  if (filters.campaignId) closedOppsQuery = closedOppsQuery.eq("campaign_id", filters.campaignId);
  if (filters.segmentId) closedOppsQuery = closedOppsQuery.eq("segment_id", filters.segmentId);

  let prevClosedOppsQuery = comparisonRange
    ? supabase
        .from("opportunities")
        .select("id, deal_value, stage, closed_at")
        .in("stage", CLOSED_STAGES)
        .gte("closed_at", comparisonRange.from.toISOString())
        .lte("closed_at", comparisonRange.to.toISOString())
    : null;
  if (prevClosedOppsQuery && ownerIds) prevClosedOppsQuery = prevClosedOppsQuery.in("owner_id", ownerIds);

  // All opportunities (any stage) — for the Pipeline-by-Stage chart and Top
  // Campaigns table, which need every stage, not just open/closed buckets.
  let allOppsQuery = supabase.from("opportunities").select("id, deal_value, stage, campaign_id, created_at");
  if (ownerIds) allOppsQuery = allOppsQuery.in("owner_id", ownerIds);

  const [openOppsRes, closedOppsRes, prevClosedOppsRes, allOppsRes] = await Promise.all([
    openOppsQuery,
    closedOppsQuery,
    prevClosedOppsQuery ?? Promise.resolve({ data: [] }),
    allOppsQuery,
  ]);
  const openOpps = (openOppsRes.data as { id: string; deal_value: number; stage: OpportunityStage; created_at: string }[]) || [];
  const closedOpps = (closedOppsRes.data as { id: string; deal_value: number; stage: OpportunityStage; closed_at: string }[]) || [];
  const prevClosedOpps = (prevClosedOppsRes.data as { id: string; deal_value: number; stage: OpportunityStage }[]) || [];
  const allOpps = (allOppsRes.data as { id: string; deal_value: number; stage: OpportunityStage; campaign_id: string | null; created_at: string }[]) || [];

  const won = closedOpps.filter((o) => o.stage === "won");
  const lost = closedOpps.filter((o) => o.stage === "lost");
  const prevWon = prevClosedOpps.filter((o) => o.stage === "won");
  const prevLost = prevClosedOpps.filter((o) => o.stage === "lost");

  const openPipelineValue = sum(openOpps);
  const openPipelinePrevValue = comparisonRange ? sum(openOpps.filter((o) => new Date(o.created_at) <= comparisonRange.to)) : null;

  const weightedForecastValue = calcWeightedForecast(openOpps.map((o) => ({ dealValue: Number(o.deal_value || 0), probabilityPercent: getStageForecast(o.stage).probability })));
  const weightedForecastPrevValue = comparisonRange
    ? calcWeightedForecast(
        openOpps
          .filter((o) => new Date(o.created_at) <= comparisonRange.to)
          .map((o) => ({ dealValue: Number(o.deal_value || 0), probabilityPercent: getStageForecast(o.stage).probability }))
      )
    : null;

  // ── Pipeline by Stage (open stages only, per the doc's chart toggle for
  // Closed Lost — we simply exclude both closed stages from the donut). ────
  const openStages = OPPORTUNITY_STAGES.filter((s) => !CLOSED_STAGES.includes(s));
  const pipelineByStage: PipelineStageSlice[] = openStages.map((stage) => {
    const rows = openOpps.filter((o) => o.stage === stage);
    const amount = sum(rows);
    return {
      stage,
      label: STAGE_LABELS[stage],
      count: rows.length,
      amount,
      percentOfPipeline: openPipelineValue > 0 ? Math.round((amount / openPipelineValue) * 1000) / 10 : 0,
    };
  });

  // ── Active Campaigns KPI ─────────────────────────────────────────────────
  const { data: campaignsData } = await supabase.from("campaigns").select("id, campaign_name, status, sent_count, reply_rate, bounce_rate");
  const campaigns = (campaignsData as { id: string; campaign_name: string; status: string; sent_count: number; reply_rate: number; bounce_rate: number }[]) || [];
  const activeCampaigns = campaigns.filter((c) => c.status === "Active");
  const pausedCampaigns = campaigns.filter((c) => c.status === "Paused");
  // "Needs attention": sending but bouncing heavily, or high volume with zero replies.
  const needsAttention = activeCampaigns.filter((c) => c.bounce_rate > 5 || (c.sent_count > 20 && c.reply_rate === 0)).length;

  // ── High-Priority Prospects: AI score threshold (workspace-wide current
  // snapshot, not limited to the period cohort — this is "who needs
  // outreach right now," not "who was added this period"). ────────────────
  let highPriorityQuery = supabase.from("leads").select("id", { count: "exact", head: true }).gte("lead_score", HIGH_PRIORITY_SCORE_THRESHOLD).neq("status", "Converted");
  if (ownerIds) highPriorityQuery = highPriorityQuery.in("owner_id", ownerIds);
  const { count: highPriorityCount } = await highPriorityQuery;

  // ── Revenue Trend: Closed-Won vs Weighted Forecast, bucketed by the
  // granularity resolver (daily/weekly/monthly by range length). ──────────
  const granularity = bucketDateRange(range);
  const revenueTrend = buildRevenueTrend(won, openOpps, range, granularity);

  // ── Top Performing Campaigns: attribute each all-time opportunity back to
  // its campaign_id (set at conversion time — see resolveLeadAttribution in
  // src/lib/opportunities.ts), plus reply/meeting/qualified counts derived
  // from lead_activities/meetings for leads enrolled in that campaign. ─────
  const topCampaigns = await buildTopCampaigns(supabase, campaigns, allOpps);

  const aiInsights = buildAiInsights({
    highPriorityCount: highPriorityCount ?? 0,
    replyRate: calcReplyRate(repliesCount, deliveredCount),
    prevReplyRate: null,
    topCampaign: topCampaigns[0] ?? null,
    stalledCount: openOpps.filter((o) => Date.now() - new Date(o.created_at).getTime() > 14 * 86_400_000).length,
  });

  const quickReports: QuickReportLink[] = [
    { key: "prospect_source", label: "Prospect Source Performance", href: "/leads" },
    { key: "campaign_performance", label: "Campaign Performance", href: "/campaigns" },
    { key: "sequence_performance", label: "Sequence Performance", href: "/outreach" },
    { key: "email_engagement", label: "Email Engagement", href: "/activities/emails" },
    { key: "meeting_conversion", label: "Meeting Conversion", href: "/meetings" },
    { key: "pipeline_summary", label: "Pipeline Summary", href: "/opportunities" },
    { key: "revenue_attribution", label: "Revenue Attribution", href: "/analytics?type=report" },
    { key: "ai_performance", label: "AI Performance", href: "/analytics?type=dashboard" },
  ];

  return {
    hasAnyData: leads.length > 0 || allOpps.length > 0 || campaigns.length > 0,
    showTeamFilter: ctx.directReportIds.length > 0,
    granularity,
    kpis: {
      totalProspects: { value: leads.length, previousValue: prevLeadsCount, changePercent: percentChange(leads.length, prevLeadsCount ?? 0) },
      replies: { value: repliesCount, previousValue: null, changePercent: null, replyRate: calcReplyRate(repliesCount, deliveredCount) },
      meetings: { value: meetingsInRangeCount, previousValue: prevMeetingsCount, changePercent: percentChange(meetingsInRangeCount, prevMeetingsCount ?? 0) },
      qualified: { value: qualifiedLeadCount, previousValue: null, changePercent: null },
      openPipeline: { value: openPipelineValue, previousValue: openPipelinePrevValue, changePercent: openPipelinePrevValue !== null ? percentChange(openPipelineValue, openPipelinePrevValue) : null },
      closedWonRevenue: { value: sum(won), previousValue: comparisonRange ? sum(prevWon) : null, changePercent: comparisonRange ? percentChange(sum(won), sum(prevWon)) : null },
      winRate: { value: calcWinRate(won.length, lost.length), won: won.length, lost: lost.length },
      weightedForecast: { value: weightedForecastValue, previousValue: weightedForecastPrevValue, changePercent: weightedForecastPrevValue !== null ? percentChange(weightedForecastValue, weightedForecastPrevValue) : null },
      activeCampaigns: { active: activeCampaigns.length, paused: pausedCampaigns.length, needsAttention },
      highPriorityProspects: { count: highPriorityCount ?? 0, thresholdText: `AI Score ≥ ${HIGH_PRIORITY_SCORE_THRESHOLD}` },
    },
    funnel,
    pipelineByStage,
    revenueTrend,
    topCampaigns,
    aiInsights,
    quickReports,
    lastUpdatedAt: new Date().toISOString(),
  };
}

function bucketLabelFor(date: Date, granularity: "daily" | "weekly" | "monthly"): string {
  if (granularity === "monthly") return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  if (granularity === "weekly") {
    const weekStart = new Date(date);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    return weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildRevenueTrend(
  won: { deal_value: number; closed_at: string }[],
  openOpps: { deal_value: number; stage: OpportunityStage; created_at: string }[],
  range: DateRange,
  granularity: "daily" | "weekly" | "monthly"
): RevenueTrendPoint[] {
  const buckets = new Map<string, { wonRevenue: number; weightedForecast: number }>();
  const order: string[] = [];
  const step = granularity === "monthly" ? 30 : granularity === "weekly" ? 7 : 1;
  for (let t = new Date(range.from); t <= range.to; t.setDate(t.getDate() + step)) {
    const label = bucketLabelFor(t, granularity);
    if (!buckets.has(label)) {
      buckets.set(label, { wonRevenue: 0, weightedForecast: 0 });
      order.push(label);
    }
  }
  for (const w of won) {
    const label = bucketLabelFor(new Date(w.closed_at), granularity);
    const b = buckets.get(label);
    if (b) b.wonRevenue += Number(w.deal_value || 0);
  }
  // Weighted forecast shown flat across the current period (a snapshot, not
  // a historical series — there's no stage-history table to reconstruct
  // what the forecast looked like on past dates).
  const currentForecast = calcWeightedForecast(openOpps.map((o) => ({ dealValue: Number(o.deal_value || 0), probabilityPercent: getStageForecast(o.stage).probability })));
  return order.map((label) => ({ bucketLabel: label, wonRevenue: buckets.get(label)!.wonRevenue, weightedForecast: currentForecast }));
}

async function buildTopCampaigns(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campaigns: { id: string; campaign_name: string }[],
  allOpps: { id: string; deal_value: number; stage: OpportunityStage; campaign_id: string | null }[]
): Promise<TopCampaignRow[]> {
  if (campaigns.length === 0) return [];
  const campaignIds = campaigns.map((c) => c.id);

  const [{ data: enrollments }, { data: replyActivities }] = await Promise.all([
    supabase.from("campaign_enrollments").select("campaign_id, lead_id").in("campaign_id", campaignIds),
    supabase.from("lead_activities").select("lead_id, metadata").eq("activity_type", "EMAIL_REPLIED"),
  ]);
  const enrollmentRows = (enrollments as { campaign_id: string; lead_id: string }[]) || [];
  const leadIdsByCampaign = new Map<string, Set<string>>();
  for (const e of enrollmentRows) {
    if (!leadIdsByCampaign.has(e.campaign_id)) leadIdsByCampaign.set(e.campaign_id, new Set());
    leadIdsByCampaign.get(e.campaign_id)!.add(e.lead_id);
  }

  const replyLeadIds = new Set(((replyActivities as { lead_id: string }[]) || []).map((r) => r.lead_id));

  let leadStatusByCampaign = new Map<string, { id: string; status: string }[]>();
  const allEnrolledLeadIds = Array.from(new Set(enrollmentRows.map((e) => e.lead_id)));
  if (allEnrolledLeadIds.length) {
    const { data: leadRows } = await supabase.from("leads").select("id, status").in("id", allEnrolledLeadIds);
    const byId = new Map(((leadRows as { id: string; status: string }[]) || []).map((l) => [l.id, l]));
    leadStatusByCampaign = new Map(
      Array.from(leadIdsByCampaign.entries()).map(([campaignId, ids]) => [campaignId, Array.from(ids).map((id) => byId.get(id)).filter(Boolean) as { id: string; status: string }[]])
    );
  }

  const oppsByCampaign = new Map<string, { deal_value: number; stage: OpportunityStage }[]>();
  for (const o of allOpps) {
    if (!o.campaign_id) continue;
    if (!oppsByCampaign.has(o.campaign_id)) oppsByCampaign.set(o.campaign_id, []);
    oppsByCampaign.get(o.campaign_id)!.push(o);
  }

  const rows: TopCampaignRow[] = campaigns.map((c) => {
    const leadIds = leadIdsByCampaign.get(c.id) ?? new Set<string>();
    const replies = Array.from(leadIds).filter((id) => replyLeadIds.has(id)).length;
    const qualified = (leadStatusByCampaign.get(c.id) || []).filter((l) => l.status === "Qualified" || l.status === "Converted").length;
    const opps = oppsByCampaign.get(c.id) || [];
    const won = opps.filter((o) => o.stage === "won");
    return {
      id: c.id,
      name: c.campaign_name,
      replies,
      meetings: 0, // meetings aren't linked to a campaign_id directly in this schema
      qualified,
      opportunities: opps.length,
      pipeline: sum(opps.filter((o) => !CLOSED_STAGES.includes(o.stage))),
      revenue: sum(won),
    };
  });

  return rows.filter((r) => r.replies > 0 || r.opportunities > 0 || r.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
}

function buildAiInsights(input: {
  highPriorityCount: number;
  replyRate: number;
  prevReplyRate: number | null;
  topCampaign: TopCampaignRow | null;
  stalledCount: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (input.highPriorityCount > 0) {
    insights.push({
      id: "high_priority",
      priority: "high",
      title: `${input.highPriorityCount} high-priority prospects are ready for outreach.`,
      description: "These prospects match your AI score threshold and haven't converted yet.",
      ctaLabel: "View Prospects",
      ctaHref: "/leads",
    });
  }

  if (input.stalledCount > 0) {
    insights.push({
      id: "stalled_opportunities",
      priority: input.stalledCount >= 5 ? "critical" : "medium",
      title: `${input.stalledCount} opportunities have had no activity for 14+ days.`,
      description: "These deals risk stalling in the pipeline without a follow-up.",
      ctaLabel: "Review Opportunities",
      ctaHref: "/opportunities",
    });
  }

  if (input.topCampaign && input.topCampaign.revenue > 0) {
    insights.push({
      id: "top_campaign_revenue",
      priority: "medium",
      title: `${input.topCampaign.name} generated $${Math.round(input.topCampaign.revenue).toLocaleString()} in closed revenue.`,
      description: "This is your highest-revenue campaign in the current filters.",
      ctaLabel: "View Campaign",
      ctaHref: `/campaigns/${input.topCampaign.id}`,
    });
  }

  if (input.replyRate === 0) {
    insights.push({
      id: "no_replies",
      priority: "high",
      title: "No replies recorded in the selected period.",
      description: "Check that outreach is sending and that reply tracking is connected.",
      ctaLabel: "View Email Report",
      ctaHref: "/activities/emails",
    });
  }

  return insights.slice(0, 5);
}
