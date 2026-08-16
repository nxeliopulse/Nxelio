"use server";
import { createClient } from "@/lib/supabase/server";
import { resolveDateRangePreset, calcWeightedForecast, type DateRangePreset, type DateRange } from "@/lib/analytics/overview-metrics";
import { CLOSED_STAGES, getStageForecast, type OpportunityStage } from "@/lib/opportunities";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";
import { getActiveQuota } from "@/lib/queries/sales-quotas";
import { getPipelineTrend, getNearestPipelineSnapshot } from "@/lib/queries/pipeline-snapshots";
import { filterAndRecordRecommendations } from "@/lib/queries/ai-recommendations";

export interface RevenueFilters {
  dateRange: DateRangePreset;
  customFrom?: string;
  customTo?: string;
}

interface OppRow {
  id: string;
  deal_value: number;
  stage: OpportunityStage;
  source: string | null;
  campaign_id: string | null;
  segment_id: string | null;
  owner_id: string | null;
  account_id: string | null;
  lead_id: string | null;
  company: string | null;
  created_at: string;
  closed_at: string | null;
  expected_close_date: string | null;
}

export interface AttributionRow {
  label: string;
  wonRevenue: number;
  openPipeline: number;
  dealCount: number;
  winRate: number;
}

export interface RevenueTrendPoint {
  bucketLabel: string;
  wonRevenue: number;
}

export interface ForecastCategoryRow {
  category: string;
  value: number;
  weightedValue: number;
  dealCount: number;
}

export interface RevenueAiInsight {
  id: string;
  title: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface PipelineTrendPoint {
  date: string;
  totalPipelineValue: number;
  weightedPipelineValue: number;
}

export interface ForecastAccuracy {
  predictedAtRangeStart: number;
  actualWonRevenue: number;
  accuracyPercent: number;
  asOfDate: string;
}

export interface SlippageSummary {
  dealCount: number;
  totalValue: number;
}

export interface RevenueAnalyticsData {
  hasAnyData: boolean;
  kpis: {
    wonRevenue: number;
    wonDealCount: number;
    averageWonDeal: number;
    weightedPipeline: number;
  };
  /** Null when no team-wide revenue quota (sales_quotas, user_id NULL) covers the
   *  end of the selected range — the settings UI at Administration → Sales Quotas
   *  has to have one configured for these to appear. */
  quota: {
    targetAmount: number;
    periodStart: string;
    periodEnd: string;
    pipelineCoverageRatio: number;
    attainmentPercent: number;
    gapToTarget: number;
  } | null;
  revenueTrend: RevenueTrendPoint[];
  /** Real historical open-pipeline series from pipeline_snapshots (migration
   *  0129) — empty until the daily cron has run at least once. */
  pipelineTrend: PipelineTrendPoint[];
  /** Null until a snapshot exists on/before the range start to compare
   *  against. */
  forecastAccuracy: ForecastAccuracy | null;
  slippage: SlippageSummary;
  forecastCategories: ForecastCategoryRow[];
  attribution: {
    bySource: AttributionRow[];
    bySegment: AttributionRow[];
    byCampaign: AttributionRow[];
    byIndustry: AttributionRow[];
    byOwner: AttributionRow[];
    byAccount: AttributionRow[];
  };
  aiInsights: RevenueAiInsight[];
  lastUpdatedAt: string;
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

function aggregateByKey(opps: OppRow[], keyFn: (o: OppRow) => string | null, labelFor: (key: string) => string): AttributionRow[] {
  const buckets = new Map<string, { wonRevenue: number; openPipeline: number; dealCount: number; won: number; lost: number }>();
  for (const o of opps) {
    const key = keyFn(o) || "Unattributed";
    if (!buckets.has(key)) buckets.set(key, { wonRevenue: 0, openPipeline: 0, dealCount: 0, won: 0, lost: 0 });
    const bucket = buckets.get(key)!;
    bucket.dealCount += 1;
    if (o.stage === "won") { bucket.wonRevenue += Number(o.deal_value || 0); bucket.won += 1; }
    else if (o.stage === "lost") bucket.lost += 1;
    else bucket.openPipeline += Number(o.deal_value || 0);
  }
  return Array.from(buckets.entries())
    .map(([key, v]) => ({
      label: labelFor(key),
      wonRevenue: v.wonRevenue,
      openPipeline: v.openPipeline,
      dealCount: v.dealCount,
      winRate: v.won + v.lost > 0 ? Math.round((v.won / (v.won + v.lost)) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.wonRevenue - a.wonRevenue);
}

export async function getRevenueAnalytics(filters: RevenueFilters): Promise<RevenueAnalyticsData> {
  const supabase = await createClient();
  const ctx = await getAnalyticsContext();
  const now = new Date();
  const range: DateRange =
    filters.dateRange === "custom" && filters.customFrom && filters.customTo
      ? { from: new Date(filters.customFrom), to: new Date(filters.customTo) }
      : resolveDateRangePreset(filters.dateRange === "custom" ? "last_90_days" : filters.dateRange, now);

  const ownerIds = ctx.isAdmin ? null : [ctx.userId, ...ctx.directReportIds];
  let query = supabase.from("opportunities").select("id, deal_value, stage, source, campaign_id, segment_id, owner_id, account_id, lead_id, company, created_at, closed_at, expected_close_date");
  if (ownerIds) query = query.in("owner_id", ownerIds);
  const { data } = await query;
  const opps = (data as OppRow[]) || [];

  const won = opps.filter((o) => o.stage === "won" && o.closed_at && new Date(o.closed_at) >= range.from && new Date(o.closed_at) <= range.to);
  const openOpps = opps.filter((o) => !CLOSED_STAGES.includes(o.stage));

  const wonRevenue = won.reduce((s, o) => s + Number(o.deal_value || 0), 0);
  const weightedPipeline = calcWeightedForecast(openOpps.map((o) => ({ dealValue: Number(o.deal_value || 0), probabilityPercent: getStageForecast(o.stage).probability })));

  // Revenue Forecast categories — Pipeline (all open), Probable (qualified —
  // the earliest, lowest-confidence open stage), Best Case
  // (meeting_scheduled/proposal_sent), Commit (negotiation), Closed (won in
  // range). Matches the doc's 5 category names using this schema's stage
  // names (no separate probability field exists), each with its own
  // weighted amount so the table shows Count/Total/Weighted per category.
  const weighted = (rows: OppRow[]) => calcWeightedForecast(rows.map((o) => ({ dealValue: Number(o.deal_value || 0), probabilityPercent: getStageForecast(o.stage).probability })));
  const probableOpps = openOpps.filter((o) => o.stage === "qualified");
  const bestCaseOpps = openOpps.filter((o) => o.stage === "meeting_scheduled" || o.stage === "proposal_sent");
  const commitOpps = openOpps.filter((o) => o.stage === "negotiation");
  const forecastCategories: ForecastCategoryRow[] = [
    { category: "Pipeline", value: openOpps.reduce((s, o) => s + Number(o.deal_value || 0), 0), weightedValue: weightedPipeline, dealCount: openOpps.length },
    { category: "Probable", value: probableOpps.reduce((s, o) => s + Number(o.deal_value || 0), 0), weightedValue: weighted(probableOpps), dealCount: probableOpps.length },
    { category: "Best Case", value: bestCaseOpps.reduce((s, o) => s + Number(o.deal_value || 0), 0), weightedValue: weighted(bestCaseOpps), dealCount: bestCaseOpps.length },
    { category: "Commit", value: commitOpps.reduce((s, o) => s + Number(o.deal_value || 0), 0), weightedValue: weighted(commitOpps), dealCount: commitOpps.length },
    { category: "Closed", value: wonRevenue, weightedValue: wonRevenue, dealCount: won.length },
  ];

  // Quota Coverage/Attainment/Gap — team-wide revenue quota (sales_quotas,
  // user_id NULL) covering the end of the selected range. Pipeline Coverage
  // compares total open pipeline value (not weighted) against the target, the
  // standard "how many multiples of quota is sitting in the pipeline" ratio.
  const revenueQuota = await getActiveQuota(range.to, null);
  const totalOpenPipelineValue = openOpps.reduce((s, o) => s + Number(o.deal_value || 0), 0);
  const quota = revenueQuota && revenueQuota.targetAmount > 0
    ? {
        targetAmount: revenueQuota.targetAmount,
        periodStart: revenueQuota.periodStart,
        periodEnd: revenueQuota.periodEnd,
        pipelineCoverageRatio: Math.round((totalOpenPipelineValue / revenueQuota.targetAmount) * 100) / 100,
        attainmentPercent: Math.round((wonRevenue / revenueQuota.targetAmount) * 1000) / 10,
        gapToTarget: Math.max(0, revenueQuota.targetAmount - wonRevenue),
      }
    : null;

  // Pipeline Trend + Forecast Accuracy — real history from pipeline_snapshots
  // (daily cron), not an approximation. Forecast Accuracy compares the
  // weighted pipeline as it stood at the start of the selected range (the
  // "prediction") against what actually closed by the end of it.
  const rangeFromIso = range.from.toISOString().slice(0, 10);
  const rangeToIso = range.to.toISOString().slice(0, 10);
  const [snapshotSeries, startSnapshot] = await Promise.all([
    getPipelineTrend(rangeFromIso, rangeToIso),
    getNearestPipelineSnapshot(rangeFromIso),
  ]);
  const pipelineTrend: PipelineTrendPoint[] = snapshotSeries.map((s) => ({
    date: s.snapshotDate,
    totalPipelineValue: s.totalPipelineValue,
    weightedPipelineValue: s.weightedPipelineValue,
  }));
  const forecastAccuracy: ForecastAccuracy | null = startSnapshot && startSnapshot.weightedPipelineValue > 0
    ? {
        predictedAtRangeStart: startSnapshot.weightedPipelineValue,
        actualWonRevenue: wonRevenue,
        accuracyPercent: Math.max(0, Math.round((100 - Math.min(100, (Math.abs(startSnapshot.weightedPipelineValue - wonRevenue) / startSnapshot.weightedPipelineValue) * 100)) * 10) / 10),
        asOfDate: startSnapshot.snapshotDate,
      }
    : null;

  // Slippage — open deals whose expected close date has already passed.
  const todayIso = now.toISOString().slice(0, 10);
  const slippedOpps = openOpps.filter((o) => o.expected_close_date && o.expected_close_date < todayIso);
  const slippage: SlippageSummary = {
    dealCount: slippedOpps.length,
    totalValue: slippedOpps.reduce((s, o) => s + Number(o.deal_value || 0), 0),
  };

  // Revenue Trend (monthly buckets over the selected range)
  const buckets = new Map<string, number>();
  const order: string[] = [];
  for (let t = new Date(range.from); t <= range.to; t.setDate(t.getDate() + 7)) {
    const label = bucketLabelFor(t, "weekly");
    if (!buckets.has(label)) {
      buckets.set(label, 0);
      order.push(label);
    }
  }
  for (const o of won) {
    const label = bucketLabelFor(new Date(o.closed_at!), "weekly");
    if (buckets.has(label)) buckets.set(label, buckets.get(label)! + Number(o.deal_value || 0));
  }
  const revenueTrend: RevenueTrendPoint[] = order.map((label) => ({ bucketLabel: label, wonRevenue: buckets.get(label)! }));

  // Attribution — resolve names for segment/campaign/account, and industry
  // via each opportunity's originating lead (opportunities carry no
  // industry column of their own).
  const segmentIds = Array.from(new Set(opps.map((o) => o.segment_id).filter(Boolean) as string[]));
  const campaignIds = Array.from(new Set(opps.map((o) => o.campaign_id).filter(Boolean) as string[]));
  const accountIds = Array.from(new Set(opps.map((o) => o.account_id).filter(Boolean) as string[]));
  const leadIds = Array.from(new Set(opps.map((o) => o.lead_id).filter(Boolean) as string[]));

  const [{ data: segmentsData }, { data: campaignsData }, { data: accountsData }, { data: leadsData }] = await Promise.all([
    segmentIds.length ? supabase.from("segments").select("id, segment_name").in("id", segmentIds) : Promise.resolve({ data: [] }),
    campaignIds.length ? supabase.from("campaigns").select("id, campaign_name").in("id", campaignIds) : Promise.resolve({ data: [] }),
    accountIds.length ? supabase.from("accounts").select("id, account_name").in("id", accountIds) : Promise.resolve({ data: [] }),
    leadIds.length ? supabase.from("leads").select("id, industry").in("id", leadIds) : Promise.resolve({ data: [] }),
  ]);
  const segmentNameById = new Map(((segmentsData as { id: string; segment_name: string }[]) || []).map((s) => [s.id, s.segment_name]));
  const campaignNameById = new Map(((campaignsData as { id: string; campaign_name: string }[]) || []).map((c) => [c.id, c.campaign_name]));
  const accountNameById = new Map(((accountsData as { id: string; account_name: string }[]) || []).map((a) => [a.id, a.account_name]));
  const industryByLeadId = new Map(((leadsData as { id: string; industry: string | null }[]) || []).map((l) => [l.id, l.industry]));

  const bySourceRows = aggregateByKey(opps, (o) => o.source, (k) => k);
  const aiInsights: RevenueAiInsight[] = [];
  const topSource = [...bySourceRows].sort((a, b) => b.wonRevenue - a.wonRevenue)[0];
  if (topSource && topSource.wonRevenue > 0) {
    aiInsights.push({ id: "top_source", title: `${topSource.label} drove $${Math.round(topSource.wonRevenue).toLocaleString()} in won revenue — your top source.`, ctaLabel: "View Opportunities", ctaHref: "/opportunities" });
  }
  if (won.length > 0) {
    const concentrationTop = [...opps].filter((o) => o.stage === "won").sort((a, b) => Number(b.deal_value) - Number(a.deal_value)).slice(0, Math.max(1, Math.round(won.length * 0.2)));
    const concentrationRevenue = concentrationTop.reduce((s, o) => s + Number(o.deal_value || 0), 0);
    const concentrationPct = wonRevenue > 0 ? Math.round((concentrationRevenue / wonRevenue) * 100) : 0;
    if (concentrationPct >= 50) {
      aiInsights.push({ id: "concentration", title: `Your top 20% of deals account for ${concentrationPct}% of won revenue.`, ctaLabel: "View Top Deals", ctaHref: "/opportunities" });
    }
  }
  if (weightedPipeline > 0 && wonRevenue === 0) {
    aiInsights.push({ id: "no_closed", title: "No revenue closed in the selected period, but there's active weighted pipeline.", ctaLabel: "View Pipeline", ctaHref: "/analytics/pipeline" });
  }
  if (slippage.dealCount > 0) {
    aiInsights.push({ id: "slippage", title: `${slippage.dealCount} deal${slippage.dealCount === 1 ? "" : "s"} worth $${Math.round(slippage.totalValue).toLocaleString()} slipped past their expected close date.`, ctaLabel: "View Opportunities", ctaHref: "/opportunities" });
  }

  return {
    hasAnyData: opps.length > 0,
    kpis: {
      wonRevenue,
      wonDealCount: won.length,
      averageWonDeal: won.length ? Math.round(wonRevenue / won.length) : 0,
      weightedPipeline,
    },
    quota,
    revenueTrend,
    pipelineTrend,
    forecastAccuracy,
    slippage,
    forecastCategories,
    attribution: {
      bySource: bySourceRows,
      bySegment: aggregateByKey(opps, (o) => o.segment_id, (k) => segmentNameById.get(k) || "Unattributed"),
      byCampaign: aggregateByKey(opps, (o) => o.campaign_id, (k) => campaignNameById.get(k) || "Unattributed"),
      byIndustry: aggregateByKey(opps, (o) => (o.lead_id ? industryByLeadId.get(o.lead_id) ?? null : null), (k) => k),
      byOwner: aggregateByKey(opps, (o) => o.owner_id, (k) => k), // resolved to names by the page/view layer
      byAccount: aggregateByKey(opps, (o) => o.account_id || o.company, (k) => accountNameById.get(k) || k),
    },
    aiInsights: await filterAndRecordRecommendations("revenue", aiInsights),
    lastUpdatedAt: new Date().toISOString(),
  };
}
