"use server";
import { createClient } from "@/lib/supabase/server";
import {
  resolveDateRangePreset,
  previousPeriodRange,
  percentChange,
  calcReplyRate,
  bucketDateRange,
  type DateRangePreset,
  type ComparisonMode,
  type DateRange,
} from "@/lib/analytics/overview-metrics";
import { AI_SCORE_BANDS, buyingIntentFromScore, classifyEngagement, type EngagementLevel } from "@/lib/analytics/prospects-metrics";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";

const HIGH_PRIORITY_SCORE_THRESHOLD = 75;
const CONTACTED_ACTIVITY_TYPES = ["EMAIL_SENT"];

export interface ProspectsFilters {
  dateRange: DateRangePreset;
  customFrom?: string;
  customTo?: string;
  comparison: ComparisonMode;
  owner?: string;
  source?: string;
  industry?: string;
  companySize?: string;
  country?: string;
  status?: string;
  segmentId?: string;
  aiScoreMin?: number;
  aiScoreMax?: number;
}

export interface KpiValue {
  value: number;
  changePercent: number | null;
}

interface LeadRow {
  id: string;
  full_name: string | null;
  company_name: string | null;
  job_title: string | null;
  source: string | null;
  industry: string | null;
  company_size: string | null;
  country: string | null;
  status: string;
  lead_score: number;
  linkedin: string | null;
  website_url: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GrowthPoint {
  bucketLabel: string;
  added: number;
  enriched: number;
  qualified: number;
}

export interface SourceSlice {
  label: string;
  count: number;
  percent: number;
}

export interface IndustrySlice {
  label: string;
  count: number;
  percent: number;
}

export interface ScoreBandRow {
  label: string;
  min: number;
  max: number;
  count: number;
  percent: number;
  replyRate: number;
  meetingRate: number;
}

export interface CompanySizeSlice {
  label: string;
  count: number;
}

export interface TopProspectRow {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  source: string | null;
  aiScore: number;
  buyingIntent: string;
  engagement: EngagementLevel;
  lastActivity: string | null;
  ownerId: string | null;
  status: string;
}

export interface ProspectsAiInsight {
  id: string;
  title: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface ProspectsAnalyticsData {
  hasAnyData: boolean;
  showTeamFilter: boolean;
  granularity: "daily" | "weekly" | "monthly";
  kpis: {
    totalProspects: KpiValue;
    newProspects: KpiValue;
    enrichedProspects: KpiValue;
    aiScoredProspects: KpiValue;
    highPriorityProspects: { count: number; thresholdText: string };
    qualifiedProspects: KpiValue;
  };
  growth: GrowthPoint[];
  bySource: SourceSlice[];
  byIndustry: IndustrySlice[];
  scoreDistribution: ScoreBandRow[];
  byCompanySize: CompanySizeSlice[];
  topProspects: TopProspectRow[];
  aiInsights: ProspectsAiInsight[];
  lastUpdatedAt: string;
}

function resolveOwnerIds(ctx: { userId: string; isAdmin: boolean; directReportIds: string[] }, owner: string | undefined): string[] | null {
  const resolved = owner ?? (ctx.isAdmin ? "all" : "me");
  if (resolved === "all") return null;
  if (resolved === "team") return [ctx.userId, ...ctx.directReportIds];
  if (resolved === "me") return [ctx.userId];
  return [resolved];
}

function resolveRange(filters: ProspectsFilters, now: Date): DateRange {
  if (filters.dateRange === "custom" && filters.customFrom && filters.customTo) {
    return { from: new Date(filters.customFrom), to: new Date(filters.customTo) };
  }
  return resolveDateRangePreset(filters.dateRange === "custom" ? "last_30_days" : filters.dateRange, now);
}

function isEnriched(l: { industry: string | null; linkedin: string | null; website_url: string | null }): boolean {
  return Boolean(l.industry && (l.linkedin || l.website_url));
}

export async function getProspectsAnalytics(filters: ProspectsFilters): Promise<ProspectsAnalyticsData> {
  const supabase = await createClient();
  const ctx = await getAnalyticsContext();
  const now = new Date();
  const range = resolveRange(filters, now);
  const comparisonRange = previousPeriodRange(range, filters.comparison);
  const ownerIds = resolveOwnerIds(ctx, filters.owner);

  // Base set: every lead matching the non-date filters (a live snapshot,
  // not bound to the date range — "Total Prospects" is a current count).
  let baseQuery = supabase
    .from("leads")
    .select("id, full_name, company_name, job_title, source, industry, company_size, country, status, lead_score, linkedin, website_url, owner_id, created_at, updated_at");
  if (ownerIds) baseQuery = baseQuery.in("owner_id", ownerIds);
  if (filters.source) baseQuery = baseQuery.eq("source", filters.source);
  if (filters.industry) baseQuery = baseQuery.eq("industry", filters.industry);
  if (filters.companySize) baseQuery = baseQuery.eq("company_size", filters.companySize);
  if (filters.country) baseQuery = baseQuery.eq("country", filters.country);
  if (filters.status) baseQuery = baseQuery.eq("status", filters.status);
  if (filters.aiScoreMin != null) baseQuery = baseQuery.gte("lead_score", filters.aiScoreMin);
  if (filters.aiScoreMax != null) baseQuery = baseQuery.lte("lead_score", filters.aiScoreMax);

  let segmentLeadIds: string[] | null = null;
  if (filters.segmentId) {
    const { data: members } = await supabase.from("segment_members").select("lead_id").eq("segment_id", filters.segmentId);
    segmentLeadIds = ((members as { lead_id: string }[]) || []).map((m) => m.lead_id);
    baseQuery = baseQuery.in("id", segmentLeadIds.length ? segmentLeadIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  const { data: baseData } = await baseQuery;
  const leads = (baseData as LeadRow[]) || [];
  const leadIds = leads.map((l) => l.id);

  // Downstream signals for engagement/score-band conversion — activities,
  // replies, meetings tied to this exact lead set.
  const [activityRes, meetingsRes] = leadIds.length
    ? await Promise.all([
        supabase.from("lead_activities").select("lead_id, activity_type, created_at").in("lead_id", leadIds).in("activity_type", [...CONTACTED_ACTIVITY_TYPES, "EMAIL_REPLIED"]),
        supabase.from("meetings").select("lead_id").in("lead_id", leadIds),
      ])
    : [{ data: [] }, { data: [] }];
  const activities = (activityRes.data as { lead_id: string; activity_type: string; created_at: string }[]) || [];
  const meetingLeadIds = new Set(((meetingsRes.data as { lead_id: string | null }[]) || []).map((m) => m.lead_id).filter(Boolean) as string[]);

  const touchCountByLead = new Map<string, number>();
  const replyLeadIds = new Set<string>();
  const lastActivityByLead = new Map<string, string>();
  for (const a of activities) {
    touchCountByLead.set(a.lead_id, (touchCountByLead.get(a.lead_id) || 0) + 1);
    if (a.activity_type === "EMAIL_REPLIED") replyLeadIds.add(a.lead_id);
    const prev = lastActivityByLead.get(a.lead_id);
    if (!prev || a.created_at > prev) lastActivityByLead.set(a.lead_id, a.created_at);
  }

  // ── KPIs ──────────────────────────────────────────────────────────────
  const newInRange = leads.filter((l) => new Date(l.created_at) >= range.from && new Date(l.created_at) <= range.to);
  const enriched = leads.filter(isEnriched);
  const aiScored = leads.filter((l) => (l.lead_score || 0) > 0);
  const highPriority = leads.filter((l) => (l.lead_score || 0) >= HIGH_PRIORITY_SCORE_THRESHOLD);
  const qualifiedInRange = leads.filter((l) => l.status === "Qualified" && new Date(l.updated_at) >= range.from && new Date(l.updated_at) <= range.to);

  let prevNewCount: number | null = null;
  let prevQualifiedCount: number | null = null;
  if (comparisonRange) {
    prevNewCount = leads.filter((l) => new Date(l.created_at) >= comparisonRange.from && new Date(l.created_at) <= comparisonRange.to).length;
    prevQualifiedCount = leads.filter((l) => l.status === "Qualified" && new Date(l.updated_at) >= comparisonRange.from && new Date(l.updated_at) <= comparisonRange.to).length;
  }

  // ── Growth Over Time (3 series, bucketed) ───────────────────────────────
  const granularity = bucketDateRange(range);
  const growth = buildGrowthSeries(leads, range, granularity);

  // ── By Source / By Industry ─────────────────────────────────────────────
  const bySource = groupAndRank(leads, (l) => l.source);
  const byIndustry = groupAndRank(leads, (l) => l.industry);

  // ── AI Score Distribution ────────────────────────────────────────────────
  const scoreDistribution: ScoreBandRow[] = AI_SCORE_BANDS.map((band) => {
    const inBand = leads.filter((l) => (l.lead_score || 0) >= band.min && (l.lead_score || 0) <= band.max);
    const inBandIds = new Set(inBand.map((l) => l.id));
    const bandReplies = Array.from(replyLeadIds).filter((id) => inBandIds.has(id)).length;
    const bandContacted = inBand.filter((l) => touchCountByLead.has(l.id)).length;
    const bandMeetings = inBand.filter((l) => meetingLeadIds.has(l.id)).length;
    return {
      label: band.label,
      min: band.min,
      max: band.max,
      count: inBand.length,
      percent: leads.length ? Math.round((inBand.length / leads.length) * 1000) / 10 : 0,
      replyRate: calcReplyRate(bandReplies, bandContacted || inBand.length || 1),
      meetingRate: inBand.length ? Math.round((bandMeetings / inBand.length) * 1000) / 10 : 0,
    };
  });

  // ── By Company Size ──────────────────────────────────────────────────────
  const byCompanySize = groupAndRank(leads, (l) => l.company_size).map((s) => ({ label: s.label, count: s.count }));

  // ── Top Prospects table (AI Score desc, top 50) ─────────────────────────
  const topProspects: TopProspectRow[] = [...leads]
    .sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0))
    .slice(0, 50)
    .map((l) => ({
      id: l.id,
      name: l.full_name || l.company_name || "Unnamed",
      company: l.company_name,
      title: l.job_title,
      source: l.source,
      aiScore: l.lead_score || 0,
      buyingIntent: buyingIntentFromScore(l.lead_score || 0),
      engagement: classifyEngagement({ hasReply: replyLeadIds.has(l.id), hasMeeting: meetingLeadIds.has(l.id), touchCount: touchCountByLead.get(l.id) || 0 }),
      lastActivity: lastActivityByLead.get(l.id) ?? null,
      ownerId: l.owner_id,
      status: l.status,
    }));

  // ── AI Insights (rule-based) ─────────────────────────────────────────────
  const notContactedHighScore = highPriority.filter((l) => !touchCountByLead.has(l.id)).length;
  const staleHighIntent = highPriority.filter((l) => {
    const last = lastActivityByLead.get(l.id);
    if (!last) return true;
    return Date.now() - new Date(last).getTime() > 7 * 86_400_000;
  }).length;
  const aiInsights: ProspectsAiInsight[] = [];
  if (notContactedHighScore > 0) {
    aiInsights.push({ id: "not_contacted", title: `${notContactedHighScore} high-score prospects have not been contacted.`, ctaLabel: "View Prospects", ctaHref: "/leads" });
  }
  if (staleHighIntent > 0) {
    aiInsights.push({ id: "stale_high_intent", title: `${staleHighIntent} high-intent prospects have had no activity for 7+ days.`, ctaLabel: "View Prospects", ctaHref: "/leads" });
  }
  const topIndustry = byIndustry[0];
  if (topIndustry) {
    aiInsights.push({ id: "top_industry", title: `${topIndustry.label} is your largest prospect industry (${topIndustry.percent}% of total).`, ctaLabel: "View Prospects", ctaHref: "/leads" });
  }

  return {
    hasAnyData: leads.length > 0,
    showTeamFilter: ctx.directReportIds.length > 0,
    granularity,
    kpis: {
      totalProspects: { value: leads.length, changePercent: null },
      newProspects: { value: newInRange.length, changePercent: prevNewCount != null ? percentChange(newInRange.length, prevNewCount) : null },
      enrichedProspects: { value: enriched.length, changePercent: null },
      aiScoredProspects: { value: aiScored.length, changePercent: null },
      highPriorityProspects: { count: highPriority.length, thresholdText: `AI Score ≥ ${HIGH_PRIORITY_SCORE_THRESHOLD}` },
      qualifiedProspects: { value: qualifiedInRange.length, changePercent: prevQualifiedCount != null ? percentChange(qualifiedInRange.length, prevQualifiedCount) : null },
    },
    growth,
    bySource,
    byIndustry,
    scoreDistribution,
    byCompanySize,
    topProspects,
    aiInsights: aiInsights.slice(0, 5),
    lastUpdatedAt: new Date().toISOString(),
  };
}

function groupAndRank(leads: LeadRow[], keyFn: (l: LeadRow) => string | null): SourceSlice[] {
  const counts = new Map<string, number>();
  for (const l of leads) {
    const key = keyFn(l) || "Other";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const total = leads.length;
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, percent: total ? Math.round((count / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count);
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

function buildGrowthSeries(leads: LeadRow[], range: DateRange, granularity: "daily" | "weekly" | "monthly"): GrowthPoint[] {
  const buckets = new Map<string, GrowthPoint>();
  const order: string[] = [];
  const step = granularity === "monthly" ? 30 : granularity === "weekly" ? 7 : 1;
  for (let t = new Date(range.from); t <= range.to; t.setDate(t.getDate() + step)) {
    const label = bucketLabelFor(t, granularity);
    if (!buckets.has(label)) {
      buckets.set(label, { bucketLabel: label, added: 0, enriched: 0, qualified: 0 });
      order.push(label);
    }
  }
  for (const l of leads) {
    const created = new Date(l.created_at);
    if (created < range.from || created > range.to) continue;
    const label = bucketLabelFor(created, granularity);
    const bucket = buckets.get(label);
    if (!bucket) continue;
    bucket.added += 1;
    if (isEnriched(l)) bucket.enriched += 1;
    if (l.status === "Qualified" || l.status === "Converted") bucket.qualified += 1;
  }
  return order.map((label) => buckets.get(label)!);
}
