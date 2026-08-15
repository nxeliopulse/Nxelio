"use server";
import { createClient } from "@/lib/supabase/server";
import { getStageForecast, CLOSED_STAGES, STAGE_LABELS, OPPORTUNITY_STAGES, type OpportunityStage } from "@/lib/opportunities";
import { AGING_BUCKETS, agingBucketFor, daysBetween, isStalled } from "@/lib/analytics/pipeline-metrics";
import { calcWinRate, calcWeightedForecast } from "@/lib/analytics/overview-metrics";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";

export interface PipelineFilters {
  stage?: OpportunityStage;
  owner?: string;
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
    averageDealSize: number;
    winRate: number;
    lostRate: number;
    averageSalesCycleDays: number | null;
    stalledOpportunities: number;
  };
  byStage: StageDetailRow[];
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
  lastUpdatedAt: string;
}

export async function getPipelineAnalytics(filters: PipelineFilters): Promise<PipelineAnalyticsData> {
  const supabase = await createClient();
  const ctx = await getAnalyticsContext();
  const now = new Date();

  const ownerIds = filters.owner === "all" ? null : filters.owner === "team" ? [ctx.userId, ...ctx.directReportIds] : filters.owner ? [filters.owner] : ctx.isAdmin ? null : [ctx.userId];

  let query = supabase.from("opportunities").select("id, name, deal_value, stage, owner_id, account_id, company, loss_reason, created_at, updated_at, closed_at");
  if (ownerIds) query = query.in("owner_id", ownerIds);
  if (filters.stage) query = query.eq("stage", filters.stage);
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
    };
  });

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

  // Stage Conversion — approximated as "reached this stage or later" since
  // there's no opportunity_stage_history table to reconstruct true
  // stage-to-stage transitions. Documented here as a waterfall proxy, not a
  // real cohort conversion rate.
  const stageOrder: OpportunityStage[] = ["qualified", "meeting_scheduled", "proposal_sent", "negotiation", "won"];
  const rankOf = new Map(OPPORTUNITY_STAGES.map((s, i) => [s, i]));
  const reachedOrLater = (stage: OpportunityStage) => opps.filter((o) => (rankOf.get(o.stage) ?? -1) >= (rankOf.get(stage) ?? 0)).length;
  const stageConversion: StageConversionRow[] = [];
  for (let i = 0; i < stageOrder.length - 1; i++) {
    const fromCount = reachedOrLater(stageOrder[i]);
    const toCount = reachedOrLater(stageOrder[i + 1]);
    const conversionPercent = fromCount > 0 ? Math.round((toCount / fromCount) * 1000) / 10 : 0;
    stageConversion.push({ from: STAGE_LABELS[stageOrder[i]], to: STAGE_LABELS[stageOrder[i + 1]], conversionPercent, dropOffPercent: Math.round((100 - conversionPercent) * 10) / 10 });
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

  return {
    hasAnyData: opps.length > 0,
    kpis: {
      openOpportunities: openOpps.length,
      openPipelineValue,
      averageDealSize: openOpps.length ? Math.round(openPipelineValue / openOpps.length) : 0,
      winRate: calcWinRate(wonOpps.length, lostOpps.length),
      lostRate: wonOpps.length + lostOpps.length > 0 ? Math.round((lostOpps.length / (wonOpps.length + lostOpps.length)) * 1000) / 10 : 0,
      averageSalesCycleDays: salesCycles.length ? Math.round((salesCycles.reduce((s, d) => s + d, 0) / salesCycles.length) * 10) / 10 : null,
      stalledOpportunities: stalledRows.length,
    },
    byStage,
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
    lastUpdatedAt: new Date().toISOString(),
  };
}
