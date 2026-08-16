"use server";
import { createClient } from "@/lib/supabase/server";
import { getStageForecast, CLOSED_STAGES, STAGE_LABELS, OPPORTUNITY_STAGES, type OpportunityStage } from "@/lib/opportunities";
import { AGING_BUCKETS, agingBucketFor, daysBetween, isStalled } from "@/lib/analytics/pipeline-metrics";
import { calcWinRate, calcWeightedForecast, resolveDateRangePreset, type DateRangePreset, type DateRange } from "@/lib/analytics/overview-metrics";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";
import { filterAndRecordRecommendations } from "@/lib/queries/ai-recommendations";

export interface PipelineFilters {
  stage?: OpportunityStage;
  owner?: string;
  dateRange: DateRangePreset;
  customFrom?: string;
  customTo?: string;
  source?: string;
}

export interface PipelineSourceRow {
  label: string;
  count: number;
  pipeline: number;
  weighted: number;
  wonRevenue: number;
}

export interface PipelineAiInsight {
  id: string;
  title: string;
  ctaLabel: string;
  ctaHref: string;
}

interface OppRow {
  id: string;
  name: string;
  deal_value: number;
  stage: OpportunityStage;
  owner_id: string | null;
  account_id: string | null;
  company: string | null;
  loss_reason: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface StageDetailRow {
  stage: OpportunityStage;
  label: string;
  count: number;
  totalAmount: number;
  averageAmount: number;
  weightedValue: number;
  averageAgeDays: number;
  percentOfPipeline: number;
}

export interface AgingRow {
  label: string;
  count: number;
  value: number;
}

export interface StalledOpportunityRow {
  id: string;
  name: string;
  account: string | null;
  stage: string;
  value: number;
  lastActivity: string | null;
  daysStalled: number;
  ownerId: string | null;
}

export interface StageConversionRow {
  from: string;
  to: string;
  conversionPercent: number;
  dropOffPercent: number;
  averageDaysInStage: number | null;
  /** False when opportunity_stage_history has no rows at all yet for this
   *  workspace (fresh migration, nothing has moved stage since) — the row
   *  still renders, just with the caveat that it's a first-run estimate. */
  basedOnRealHistory: boolean;
}

export interface LossReasonRow {
  reason: string;
  count: number;
  value: number;
}

export interface PipelineAnalyticsData {
  hasAnyData: boolean;
  kpis: {
    openOpportunities: number;
    openPipelineValue: number;
    weightedPipelineValue: number;
    closedWonRevenue: number;
    averageDealSize: number;
    winRate: number;
    lostRate: number;
    averageSalesCycleDays: number | null;
    stalledOpportunities: number;
  };
  byStage: StageDetailRow[];
  bySource: PipelineSourceRow[];
  aging: AgingRow[];
  stalled: StalledOpportunityRow[];
  stageConversion: StageConversionRow[];
  winLoss: {
    won: number;
    lost: number;
    averageWonValue: number;
    averageLostValue: number;
    lossReasons: LossReasonRow[];
    lossReasonsCaptured: boolean;
  };
  aiInsights: PipelineAiInsight[];
  lastUpdatedAt: string;
}

function resolveRange(filters: PipelineFilters, now: Date): DateRange {
  if (filters.dateRange === "custom" && filters.customFrom && filters.customTo) {
    return { from: new Date(filters.customFrom), to: new Date(filters.customTo) };
  }
  return resolveDateRangePreset(filters.dateRange === "custom" ? "last_30_days" : filters.dateRange, now);
}

export async function getPipelineAnalytics(filters: PipelineFilters): Promise<PipelineAnalyticsData> {
  const supabase = await createClient();
  const ctx = await getAnalyticsContext();
  const now = new Date();
  const range = resolveRange(filters, now);

  const ownerIds = filters.owner === "all" ? null : filters.owner === "team" ? [ctx.userId, ...ctx.directReportIds] : filters.owner ? [filters.owner] : ctx.isAdmin ? null : [ctx.userId];

  let query = supabase.from("opportunities").select("id, name, deal_value, stage, owner_id, account_id, company, loss_reason, source, created_at, updated_at, closed_at");
  if (ownerIds) query = query.in("owner_id", ownerIds);
  if (filters.stage) query = query.eq("stage", filters.stage);
  if (filters.source) query = query.eq("source", filters.source);
  const { data } = await query;
  const opps = (data as OppRow[]) || [];

  // Last-activity proxy: opportunities have no dedicated activity log of
  // their own, so `updated_at` (bumped on every edit/stage move) is the
  // closest real signal for staleness — same approximation used for
  // "average time to qualify" on the Meetings page.
  const openOpps = opps.filter((o) => !CLOSED_STAGES.includes(o.stage));
  const wonOpps = opps.filter((o) => o.stage === "won");
  const lostOpps = opps.filter((o) => o.stage === "lost");

  const openPipelineValue = openOpps.reduce((s, o) => s + Number(o.deal_value || 0), 0);

  // Pipeline by Stage — every open stage, with count/amount/avg/weighted/age.
  const openStages = OPPORTUNITY_STAGES.filter((s) => !CLOSED_STAGES.includes(s));
  const byStage: StageDetailRow[] = openStages.map((stage) => {
    const rows = openOpps.filter((o) => o.stage === stage);
    const total = rows.reduce((s, o) => s + Number(o.deal_value || 0), 0);
    const ages = rows.map((o) => daysBetween(o.created_at, now.toISOString()));
    return {
      stage,
      label: STAGE_LABELS[stage],
      count: rows.length,
      totalAmount: total,
      averageAmount: rows.length ? Math.round(total / rows.length) : 0,
      weightedValue: calcWeightedForecast(rows.map((o) => ({ dealValue: Number(o.deal_value || 0), probabilityPercent: getStageForecast(stage).probability }))),
      averageAgeDays: ages.length ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : 0,
      percentOfPipeline: openPipelineValue > 0 ? Math.round((total / openPipelineValue) * 1000) / 10 : 0,
    };
  });
  const weightedPipelineValue = byStage.reduce((s, r) => s + r.weightedValue, 0);

  // Closed-Won Revenue — actual Close Date within the selected range, per
  // the doc's acceptance criteria (never derived from opportunity creation
  // date, which would misattribute a deal to the wrong period).
  const closedWonInRange = opps.filter((o) => o.stage === "won" && o.closed_at && new Date(o.closed_at) >= range.from && new Date(o.closed_at) <= range.to);
  const closedWonRevenue = closedWonInRange.reduce((s, o) => s + Number(o.deal_value || 0), 0);

  // Pipeline by Source
  const sourceCounts = new Map<string, { count: number; pipeline: number; weighted: number; wonRevenue: number }>();
  for (const o of opps) {
    const key = o.source || "Other";
    if (!sourceCounts.has(key)) sourceCounts.set(key, { count: 0, pipeline: 0, weighted: 0, wonRevenue: 0 });
    const bucket = sourceCounts.get(key)!;
    if (!CLOSED_STAGES.includes(o.stage)) {
      bucket.count += 1;
      bucket.pipeline += Number(o.deal_value || 0);
      bucket.weighted += calcWeightedForecast([{ dealValue: Number(o.deal_value || 0), probabilityPercent: getStageForecast(o.stage).probability }]);
    }
    if (o.stage === "won") bucket.wonRevenue += Number(o.deal_value || 0);
  }
  const bySource: PipelineSourceRow[] = Array.from(sourceCounts.entries())
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.pipeline - a.pipeline);

  // Opportunity Aging
  const aging: AgingRow[] = AGING_BUCKETS.map((bucket) => {
    const rows = openOpps.filter((o) => agingBucketFor(daysBetween(o.created_at, now.toISOString())).label === bucket.label);
    return { label: bucket.label, count: rows.length, value: rows.reduce((s, o) => s + Number(o.deal_value || 0), 0) };
  });

  // Stalled Opportunities (14+ days since last update, per doc's own example)
  const stalledRows = openOpps.filter((o) => isStalled(o.updated_at, now.toISOString(), 14));
  const stalled: StalledOpportunityRow[] = stalledRows
    .map((o) => ({
      id: o.id,
      name: o.name,
      account: o.company,
      stage: STAGE_LABELS[o.stage],
      value: Number(o.deal_value || 0),
      lastActivity: o.updated_at,
      daysStalled: daysBetween(o.updated_at, now.toISOString()),
      ownerId: o.owner_id,
    }))
    .sort((a, b) => b.daysStalled - a.daysStalled)
    .slice(0, 50);

  // Stage Conversion — now backed by opportunity_stage_history (migration
  // 0127), a real trigger-populated log of every stage move. Each
  // opportunity's FIRST arrival at a given stage is used as that stage's
  // entry time, so conversion/days-in-stage reflect actual transitions
  // rather than the old "reached this stage or later" waterfall proxy.
  const stageOrder: OpportunityStage[] = ["qualified", "meeting_scheduled", "proposal_sent", "negotiation", "won"];
  const oppIdsForHistory = opps.map((o) => o.id);
  let stageHistoryRows: { opportunity_id: string; from_stage: string | null; to_stage: string; changed_at: string }[] = [];
  if (oppIdsForHistory.length) {
    const { data } = await supabase
      .from("opportunity_stage_history")
      .select("opportunity_id, from_stage, to_stage, changed_at")
      .in("opportunity_id", oppIdsForHistory)
      .order("changed_at", { ascending: true });
    stageHistoryRows = (data as typeof stageHistoryRows) || [];
  }
  const basedOnRealHistory = stageHistoryRows.some((h) => h.from_stage !== null);

  // First-arrival timestamp per opportunity per stage.
  const firstEntryByOpp = new Map<string, Map<string, string>>();
  for (const h of stageHistoryRows) {
    if (!firstEntryByOpp.has(h.opportunity_id)) firstEntryByOpp.set(h.opportunity_id, new Map());
    const stages = firstEntryByOpp.get(h.opportunity_id)!;
    if (!stages.has(h.to_stage)) stages.set(h.to_stage, h.changed_at);
  }

  const stageConversion: StageConversionRow[] = [];
  for (let i = 0; i < stageOrder.length - 1; i++) {
    const fromStage = stageOrder[i];
    const toStage = stageOrder[i + 1];
    let reachedCount = 0;
    let transitionedCount = 0;
    const daysInStage: number[] = [];
    for (const stages of firstEntryByOpp.values()) {
      const fromAt = stages.get(fromStage);
      if (!fromAt) continue;
      reachedCount += 1;
      const toAt = stages.get(toStage);
      if (toAt) {
        transitionedCount += 1;
        daysInStage.push(daysBetween(fromAt, toAt));
      }
    }
    const conversionPercent = reachedCount > 0 ? Math.round((transitionedCount / reachedCount) * 1000) / 10 : 0;
    stageConversion.push({
      from: STAGE_LABELS[fromStage],
      to: STAGE_LABELS[toStage],
      conversionPercent,
      dropOffPercent: Math.round((100 - conversionPercent) * 10) / 10,
      averageDaysInStage: daysInStage.length ? Math.round((daysInStage.reduce((s, d) => s + d, 0) / daysInStage.length) * 10) / 10 : null,
      basedOnRealHistory,
    });
  }

  // Win/Loss Analysis
  const lossReasonRows = lostOpps.filter((o) => o.loss_reason);
  const lossReasonCounts = new Map<string, { count: number; value: number }>();
  for (const o of lossReasonRows) {
    const key = o.loss_reason!;
    if (!lossReasonCounts.has(key)) lossReasonCounts.set(key, { count: 0, value: 0 });
    const bucket = lossReasonCounts.get(key)!;
    bucket.count += 1;
    bucket.value += Number(o.deal_value || 0);
  }
  const lossReasons: LossReasonRow[] = Array.from(lossReasonCounts.entries()).map(([reason, v]) => ({ reason, count: v.count, value: v.value })).sort((a, b) => b.count - a.count);

  const salesCycles = wonOpps.filter((o) => o.closed_at).map((o) => daysBetween(o.created_at, o.closed_at!));

  const aiInsights: PipelineAiInsight[] = [];
  if (stalledRows.length > 0) {
    const stalledValue = stalledRows.reduce((s, o) => s + Number(o.deal_value || 0), 0);
    aiInsights.push({ id: "stalled", title: `${stalledRows.length} opportunities worth $${Math.round(stalledValue).toLocaleString()} have had no activity for 14+ days.`, ctaLabel: "Review Stalled", ctaHref: "/opportunities" });
  }
  const topSource = bySource[0];
  if (topSource && topSource.pipeline > 0) {
    aiInsights.push({ id: "top_source", title: `${topSource.label} is your largest pipeline source at $${Math.round(topSource.pipeline).toLocaleString()}.`, ctaLabel: "View Opportunities", ctaHref: "/opportunities" });
  }
  if (lossReasons.length > 0 && lossReasons[0].count >= 2) {
    aiInsights.push({ id: "top_loss_reason", title: `"${lossReasons[0].reason}" is the most common reason deals are lost (${lossReasons[0].count} deals).`, ctaLabel: "Review Lost Deals", ctaHref: "/opportunities" });
  }

  return {
    hasAnyData: opps.length > 0,
    kpis: {
      openOpportunities: openOpps.length,
      openPipelineValue,
      weightedPipelineValue,
      closedWonRevenue,
      averageDealSize: openOpps.length ? Math.round(openPipelineValue / openOpps.length) : 0,
      winRate: calcWinRate(wonOpps.length, lostOpps.length),
      lostRate: wonOpps.length + lostOpps.length > 0 ? Math.round((lostOpps.length / (wonOpps.length + lostOpps.length)) * 1000) / 10 : 0,
      averageSalesCycleDays: salesCycles.length ? Math.round((salesCycles.reduce((s, d) => s + d, 0) / salesCycles.length) * 10) / 10 : null,
      stalledOpportunities: stalledRows.length,
    },
    byStage,
    bySource,
    aging,
    stalled,
    stageConversion,
    winLoss: {
      won: wonOpps.length,
      lost: lostOpps.length,
      averageWonValue: wonOpps.length ? Math.round(wonOpps.reduce((s, o) => s + Number(o.deal_value || 0), 0) / wonOpps.length) : 0,
      averageLostValue: lostOpps.length ? Math.round(lostOpps.reduce((s, o) => s + Number(o.deal_value || 0), 0) / lostOpps.length) : 0,
      lossReasons,
      lossReasonsCaptured: lossReasonRows.length > 0,
    },
    aiInsights: await filterAndRecordRecommendations("pipeline", aiInsights),
    lastUpdatedAt: new Date().toISOString(),
  };
}
