"use server";
import { createClient } from "@/lib/supabase/server";
import { resolveDateRangePreset, calcWeightedForecast, type DateRangePreset, type DateRange } from "@/lib/analytics/overview-metrics";
import { CLOSED_STAGES, getStageForecast, type OpportunityStage } from "@/lib/opportunities";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";

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
}

export interface AttributionRow {
  label: string;
  wonRevenue: number;
  openPipeline: number;
  dealCount: number;
}

export interface RevenueTrendPoint {
  bucketLabel: string;
  wonRevenue: number;
}

export interface ForecastCategoryRow {
  category: string;
  value: number;
  dealCount: number;
}

export interface RevenueAnalyticsData {
  hasAnyData: boolean;
  kpis: {
    wonRevenue: number;
    wonDealCount: number;
    averageWonDeal: number;
    weightedPipeline: number;
  };
  revenueTrend: RevenueTrendPoint[];
  forecastCategories: ForecastCategoryRow[];
  attribution: {
    bySource: AttributionRow[];
    bySegment: AttributionRow[];
    byCampaign: AttributionRow[];
    byIndustry: AttributionRow[];
    byOwner: AttributionRow[];
    byAccount: AttributionRow[];
  };
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
  const buckets = new Map<string, { wonRevenue: number; openPipeline: number; dealCount: number }>();
  for (const o of opps) {
    const key = keyFn(o) || "Unattributed";
    if (!buckets.has(key)) buckets.set(key, { wonRevenue: 0, openPipeline: 0, dealCount: 0 });
    const bucket = buckets.get(key)!;
    bucket.dealCount += 1;
    if (o.stage === "won") bucket.wonRevenue += Number(o.deal_value || 0);
    else if (!CLOSED_STAGES.includes(o.stage)) bucket.openPipeline += Number(o.deal_value || 0);
  }
  return Array.from(buckets.entries())
    .map(([key, v]) => ({ label: labelFor(key), ...v }))
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
  let query = supabase.from("opportunities").select("id, deal_value, stage, source, campaign_id, segment_id, owner_id, account_id, lead_id, company, created_at, closed_at");
  if (ownerIds) query = query.in("owner_id", ownerIds);
  const { data } = await query;
  const opps = (data as OppRow[]) || [];

  const won = opps.filter((o) => o.stage === "won" && o.closed_at && new Date(o.closed_at) >= range.from && new Date(o.closed_at) <= range.to);
  const openOpps = opps.filter((o) => !CLOSED_STAGES.includes(o.stage));

  const wonRevenue = won.reduce((s, o) => s + Number(o.deal_value || 0), 0);
  const weightedPipeline = calcWeightedForecast(openOpps.map((o) => ({ dealValue: Number(o.deal_value || 0), probabilityPercent: getStageForecast(o.stage).probability })));

  // Revenue Forecast categories — Pipeline (all open), Weighted Pipeline,
  // Best Case (meeting_scheduled/proposal_sent), Commit (negotiation),
  // Closed (won in range). Matches the doc's example categories using this
  // schema's stage names (no separate probability field exists).
  const bestCaseOpps = openOpps.filter((o) => o.stage === "meeting_scheduled" || o.stage === "proposal_sent");
  const commitOpps = openOpps.filter((o) => o.stage === "negotiation");
  const forecastCategories: ForecastCategoryRow[] = [
    { category: "Pipeline", value: openOpps.reduce((s, o) => s + Number(o.deal_value || 0), 0), dealCount: openOpps.length },
    { category: "Weighted Pipeline", value: weightedPipeline, dealCount: openOpps.length },
    { category: "Best Case", value: bestCaseOpps.reduce((s, o) => s + Number(o.deal_value || 0), 0), dealCount: bestCaseOpps.length },
    { category: "Commit", value: commitOpps.reduce((s, o) => s + Number(o.deal_value || 0), 0), dealCount: commitOpps.length },
    { category: "Closed", value: wonRevenue, dealCount: won.length },
  ];

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

  return {
    hasAnyData: opps.length > 0,
    kpis: {
      wonRevenue,
      wonDealCount: won.length,
      averageWonDeal: won.length ? Math.round(wonRevenue / won.length) : 0,
      weightedPipeline,
    },
    revenueTrend,
    forecastCategories,
    attribution: {
      bySource: aggregateByKey(opps, (o) => o.source, (k) => k),
      bySegment: aggregateByKey(opps, (o) => o.segment_id, (k) => segmentNameById.get(k) || "Unattributed"),
      byCampaign: aggregateByKey(opps, (o) => o.campaign_id, (k) => campaignNameById.get(k) || "Unattributed"),
      byIndustry: aggregateByKey(opps, (o) => (o.lead_id ? industryByLeadId.get(o.lead_id) ?? null : null), (k) => k),
      byOwner: aggregateByKey(opps, (o) => o.owner_id, (k) => k), // resolved to names by the page/view layer
      byAccount: aggregateByKey(opps, (o) => o.account_id || o.company, (k) => accountNameById.get(k) || k),
    },
    lastUpdatedAt: new Date().toISOString(),
  };
}
