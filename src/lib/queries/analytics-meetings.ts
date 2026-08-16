"use server";
import { createClient } from "@/lib/supabase/server";
import { resolveDateRangePreset, type DateRangePreset, type DateRange } from "@/lib/analytics/overview-metrics";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";
import { filterAndRecordRecommendations } from "@/lib/queries/ai-recommendations";

export interface MeetingsFilters {
  dateRange: DateRangePreset;
  customFrom?: string;
  customTo?: string;
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  conversionPercent: number;
}

export interface QualificationByDimensionRow {
  label: string;
  qualified: number;
  qualificationRate: number;
}

export interface MeetingOutcomeSlice {
  label: string;
  count: number;
}

export interface MeetingsAiInsight {
  id: string;
  title: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface MeetingsAnalyticsData {
  hasAnyData: boolean;
  kpis: {
    meetingsBooked: number;
    completed: number;
    cancelled: number;
    qualifiedMeetings: number;
    opportunityGeneratingMeetings: number;
  };
  funnel: FunnelStage[];
  qualification: {
    qualifiedCount: number;
    qualificationRate: number;
    averageDaysToQualify: number | null;
    bySource: QualificationByDimensionRow[];
    byOwner: QualificationByDimensionRow[];
    byIndustry: QualificationByDimensionRow[];
  };
  byOutcome: MeetingOutcomeSlice[];
  aiInsights: MeetingsAiInsight[];
  lastUpdatedAt: string;
}

export async function getMeetingsAnalytics(filters: MeetingsFilters): Promise<MeetingsAnalyticsData> {
  const supabase = await createClient();
  await getAnalyticsContext();
  const now = new Date();
  const range: DateRange =
    filters.dateRange === "custom" && filters.customFrom && filters.customTo
      ? { from: new Date(filters.customFrom), to: new Date(filters.customTo) }
      : resolveDateRangePreset(filters.dateRange === "custom" ? "last_30_days" : filters.dateRange, now);

  const { data: meetingsData } = await supabase
    .from("meetings")
    .select("id, lead_id, status, created_at")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString());
  const meetings = (meetingsData as { id: string; lead_id: string | null; status: string; created_at: string }[]) || [];
  const meetingLeadIds = Array.from(new Set(meetings.map((m) => m.lead_id).filter(Boolean) as string[]));

  let leadsById = new Map<string, { id: string; status: string; source: string | null; industry: string | null; owner_id: string | null; created_at: string; updated_at: string }>();
  let repliedLeadIds = new Set<string>();
  let oppLeadIds = new Set<string>();
  if (meetingLeadIds.length) {
    const [{ data: leadRows }, { data: replyRows }, { data: oppRows }] = await Promise.all([
      supabase.from("leads").select("id, status, source, industry, owner_id, created_at, updated_at").in("id", meetingLeadIds),
      supabase.from("lead_activities").select("lead_id").in("lead_id", meetingLeadIds).eq("activity_type", "EMAIL_REPLIED"),
      supabase.from("opportunities").select("lead_id").in("lead_id", meetingLeadIds),
    ]);
    leadsById = new Map(((leadRows as { id: string; status: string; source: string | null; industry: string | null; owner_id: string | null; created_at: string; updated_at: string }[]) || []).map((l) => [l.id, l]));
    repliedLeadIds = new Set(((replyRows as { lead_id: string }[]) || []).map((r) => r.lead_id));
    oppLeadIds = new Set(((oppRows as { lead_id: string | null }[]) || []).map((o) => o.lead_id).filter(Boolean) as string[]);
  }

  const qualifiedLeadIds = new Set(meetingLeadIds.filter((id) => {
    const l = leadsById.get(id);
    return l && (l.status === "Qualified" || l.status === "Converted");
  }));

  const completedMeetings = meetings.filter((m) => m.status === "completed");
  const completedLeadIds = new Set(completedMeetings.map((m) => m.lead_id).filter(Boolean) as string[]);

  // Funnel: Replies -> Meeting Booked -> Meeting Completed -> Qualified -> Opportunity Created
  const repliedThenMeeting = meetingLeadIds.filter((id) => repliedLeadIds.has(id));
  const funnelCounts = [
    { key: "replies", label: "Replies", count: repliedThenMeeting.length },
    { key: "meeting_booked", label: "Meeting Booked", count: meetingLeadIds.length },
    { key: "meeting_completed", label: "Meeting Completed", count: completedLeadIds.size },
    { key: "qualified", label: "Qualified", count: qualifiedLeadIds.size },
    { key: "opportunity", label: "Opportunity Created", count: meetingLeadIds.filter((id) => oppLeadIds.has(id)).length },
  ];
  const funnel: FunnelStage[] = funnelCounts.map((f, i) => ({
    ...f,
    conversionPercent: i === 0 ? 100 : funnelCounts[i - 1].count > 0 ? Math.round((f.count / funnelCounts[i - 1].count) * 1000) / 10 : 0,
  }));

  // Qualification analytics — average days from lead creation to the
  // updated_at timestamp of the status flip to Qualified (this schema has
  // no qualification_history table, so updated_at is the closest real
  // signal; if the lead changed again after qualifying, this over-counts —
  // acceptable approximation for Phase 1, documented here).
  const qualifiedLeads = Array.from(leadsById.values()).filter((l) => l.status === "Qualified" || l.status === "Converted");
  const daysToQualify = qualifiedLeads.map((l) => (new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) / 86_400_000).filter((d) => d >= 0);
  const averageDaysToQualify = daysToQualify.length ? Math.round((daysToQualify.reduce((s, d) => s + d, 0) / daysToQualify.length) * 10) / 10 : null;

  function groupByDimension(keyFn: (l: { source: string | null; industry: string | null; owner_id: string | null }) => string | null): QualificationByDimensionRow[] {
    const counts = new Map<string, { total: number; qualified: number }>();
    for (const id of meetingLeadIds) {
      const l = leadsById.get(id);
      if (!l) continue;
      const key = keyFn(l) || "Other";
      if (!counts.has(key)) counts.set(key, { total: 0, qualified: 0 });
      const bucket = counts.get(key)!;
      bucket.total += 1;
      if (qualifiedLeadIds.has(id)) bucket.qualified += 1;
    }
    return Array.from(counts.entries())
      .map(([label, c]) => ({ label, qualified: c.qualified, qualificationRate: c.total ? Math.round((c.qualified / c.total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.qualified - a.qualified);
  }

  const cancelledCount = meetings.filter((m) => m.status === "canceled").length;
  const byOutcome: MeetingOutcomeSlice[] = [
    { label: "Completed", count: completedMeetings.length },
    { label: "Cancelled", count: cancelledCount },
    { label: "Scheduled", count: meetings.filter((m) => m.status !== "completed" && m.status !== "canceled").length },
  ].filter((s) => s.count > 0);

  const aiInsights: MeetingsAiInsight[] = [];
  // Qualification Rate = Qualified / Completed Meetings (not / Booked) —
  // a meeting that hasn't happened yet can't have been qualified from.
  const qualificationRate = completedMeetings.length ? Math.round((qualifiedLeadIds.size / completedMeetings.length) * 1000) / 10 : 0;
  if (meetings.length > 5 && cancelledCount / meetings.length > 0.25) {
    aiInsights.push({ id: "high_cancel", title: `${Math.round((cancelledCount / meetings.length) * 100)}% of meetings were cancelled in this period.`, ctaLabel: "Review Meetings", ctaHref: "/meetings" });
  }
  const topSource = [...groupByDimension((l) => l.source)].sort((a, b) => b.qualificationRate - a.qualificationRate)[0];
  if (topSource && topSource.qualified > 0) {
    aiInsights.push({ id: "top_source", title: `${topSource.label} has the highest qualification rate at ${topSource.qualificationRate}%.`, ctaLabel: "View Leads", ctaHref: "/leads" });
  }
  if (completedMeetings.length > 0 && qualifiedLeadIds.size === 0) {
    aiInsights.push({ id: "no_qualified", title: "No completed meetings resulted in a qualified prospect this period.", ctaLabel: "Review Meetings", ctaHref: "/meetings" });
  }

  return {
    hasAnyData: meetings.length > 0,
    kpis: {
      meetingsBooked: meetings.length,
      completed: completedMeetings.length,
      cancelled: cancelledCount,
      qualifiedMeetings: qualifiedLeadIds.size,
      opportunityGeneratingMeetings: meetingLeadIds.filter((id) => oppLeadIds.has(id)).length,
    },
    funnel,
    qualification: {
      qualifiedCount: qualifiedLeadIds.size,
      qualificationRate,
      averageDaysToQualify,
      bySource: groupByDimension((l) => l.source),
      byOwner: groupByDimension((l) => l.owner_id),
      byIndustry: groupByDimension((l) => l.industry),
    },
    byOutcome,
    aiInsights: await filterAndRecordRecommendations("meetings", aiInsights),
    lastUpdatedAt: new Date().toISOString(),
  };
}
