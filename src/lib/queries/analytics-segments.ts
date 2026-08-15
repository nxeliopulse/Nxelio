"use server";
import { createClient } from "@/lib/supabase/server";
import { resolveDateRangePreset, calcReplyRate, calcQualificationRate, type DateRangePreset } from "@/lib/analytics/overview-metrics";
import { CLOSED_STAGES, type OpportunityStage } from "@/lib/opportunities";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";

export interface SegmentsFilters {
  dateRange: DateRangePreset;
  customFrom?: string;
  customTo?: string;
}

export interface SegmentPerformanceRow {
  id: string;
  name: string;
  type: string;
  matchingProspects: number;
  eligibleProspects: number;
  campaigns: number;
  replyRate: number;
  meetingRate: number;
  qualificationRate: number;
  opportunities: number;
  pipeline: number;
  revenue: number;
}

export interface SegmentFunnelStage {
  key: string;
  label: string;
  count: number;
  conversionPercent: number;
}

export interface SegmentsAnalyticsData {
  hasAnyData: boolean;
  kpis: {
    totalSegments: number;
    dynamicSegments: number;
    staticSegments: number;
    averageSegmentSize: number;
    activeCampaignsUsingSegments: number;
  };
  performance: SegmentPerformanceRow[];
  funnel: SegmentFunnelStage[];
  lastUpdatedAt: string;
}

export async function getSegmentsAnalytics(filters: SegmentsFilters): Promise<SegmentsAnalyticsData> {
  const supabase = await createClient();
  await getAnalyticsContext();
  const now = new Date();
  const range = filters.dateRange === "custom" && filters.customFrom && filters.customTo
    ? { from: new Date(filters.customFrom), to: new Date(filters.customTo) }
    : resolveDateRangePreset(filters.dateRange === "custom" ? "last_30_days" : filters.dateRange, now);

  const [{ data: segmentsData }, { data: membersData }, { data: campaignsData }] = await Promise.all([
    supabase.from("segments").select("id, segment_name, segment_type, status"),
    supabase.from("segment_members").select("segment_id, lead_id"),
    supabase.from("campaigns").select("id, campaign_name, segment_id, status"),
  ]);
  const segments = (segmentsData as { id: string; segment_name: string; segment_type: string; status: string }[]) || [];
  const members = (membersData as { segment_id: string; lead_id: string }[]) || [];
  const campaigns = (campaignsData as { id: string; campaign_name: string; segment_id: string | null; status: string }[]) || [];

  const leadIdsBySegment = new Map<string, Set<string>>();
  for (const m of members) {
    if (!leadIdsBySegment.has(m.segment_id)) leadIdsBySegment.set(m.segment_id, new Set());
    leadIdsBySegment.get(m.segment_id)!.add(m.lead_id);
  }
  const campaignsBySegment = new Map<string, { id: string; campaign_name: string; status: string }[]>();
  for (const c of campaigns) {
    if (!c.segment_id) continue;
    if (!campaignsBySegment.has(c.segment_id)) campaignsBySegment.set(c.segment_id, []);
    campaignsBySegment.get(c.segment_id)!.push(c);
  }

  const allMemberLeadIds = Array.from(new Set(members.map((m) => m.lead_id)));
  let leadRows: { id: string; status: string; do_not_contact: boolean | null; email_opt_out: boolean | null }[] = [];
  let activities: { lead_id: string; activity_type: string }[] = [];
  let meetingLeadIds = new Set<string>();
  let oppsByLead = new Map<string, { deal_value: number; stage: OpportunityStage }[]>();
  if (allMemberLeadIds.length) {
    const [{ data: leads }, { data: acts }, { data: meetings }, { data: opps }] = await Promise.all([
      supabase.from("leads").select("id, status, do_not_contact, email_opt_out").in("id", allMemberLeadIds),
      supabase.from("lead_activities").select("lead_id, activity_type").in("lead_id", allMemberLeadIds).in("activity_type", ["EMAIL_SENT", "EMAIL_REPLIED"]),
      supabase.from("meetings").select("lead_id").in("lead_id", allMemberLeadIds),
      supabase.from("opportunities").select("lead_id, deal_value, stage").in("lead_id", allMemberLeadIds),
    ]);
    leadRows = (leads as typeof leadRows) || [];
    activities = (acts as typeof activities) || [];
    meetingLeadIds = new Set(((meetings as { lead_id: string | null }[]) || []).map((m) => m.lead_id).filter(Boolean) as string[]);
    for (const o of (opps as { lead_id: string | null; deal_value: number; stage: OpportunityStage }[]) || []) {
      if (!o.lead_id) continue;
      if (!oppsByLead.has(o.lead_id)) oppsByLead.set(o.lead_id, []);
      oppsByLead.get(o.lead_id)!.push({ deal_value: o.deal_value, stage: o.stage });
    }
  }
  const leadById = new Map(leadRows.map((l) => [l.id, l]));
  const sentLeadIds = new Set(activities.filter((a) => a.activity_type === "EMAIL_SENT").map((a) => a.lead_id));
  const repliedLeadIds = new Set(activities.filter((a) => a.activity_type === "EMAIL_REPLIED").map((a) => a.lead_id));

  const performance: SegmentPerformanceRow[] = segments.map((s) => {
    const memberIds = Array.from(leadIdsBySegment.get(s.id) ?? []);
    const eligible = memberIds.filter((id) => {
      const l = leadById.get(id);
      return l && !l.do_not_contact && !l.email_opt_out && l.status !== "Converted";
    });
    const sent = memberIds.filter((id) => sentLeadIds.has(id)).length;
    const replies = memberIds.filter((id) => repliedLeadIds.has(id)).length;
    const meetings = memberIds.filter((id) => meetingLeadIds.has(id)).length;
    const qualified = memberIds.filter((id) => leadById.get(id)?.status === "Qualified" || leadById.get(id)?.status === "Converted").length;
    const opps = memberIds.flatMap((id) => oppsByLead.get(id) ?? []);
    const won = opps.filter((o) => o.stage === "won");
    const open = opps.filter((o) => !CLOSED_STAGES.includes(o.stage));
    return {
      id: s.id,
      name: s.segment_name,
      type: s.segment_type,
      matchingProspects: memberIds.length,
      eligibleProspects: eligible.length,
      campaigns: (campaignsBySegment.get(s.id) || []).length,
      replyRate: calcReplyRate(replies, sent || memberIds.length || 1),
      meetingRate: memberIds.length ? Math.round((meetings / memberIds.length) * 1000) / 10 : 0,
      qualificationRate: calcQualificationRate(qualified, meetings || 1),
      opportunities: opps.length,
      pipeline: open.reduce((sum, o) => sum + Number(o.deal_value || 0), 0),
      revenue: won.reduce((sum, o) => sum + Number(o.deal_value || 0), 0),
    };
  });
  performance.sort((a, b) => b.revenue - a.revenue);

  // Aggregate funnel across every segmented lead (any segment membership).
  // "Campaign Enrolled" = a member of a segment that at least one campaign
  // targets (campaignsBySegment) — a coarser signal than "Contacted" (an
  // actual send happened), since there's no per-lead enrollment status for
  // segment-targeted campaigns distinct from the send log itself.
  const allIds = allMemberLeadIds;
  const segmentIdsWithCampaigns = new Set(campaignsBySegment.keys());
  const enrolledLeadIds = new Set(
    Array.from(leadIdsBySegment.entries()).flatMap(([segmentId, ids]) => (segmentIdsWithCampaigns.has(segmentId) ? Array.from(ids) : []))
  );
  const funnelCounts = [
    { key: "segment_members", label: "Segment Members", count: allIds.length },
    { key: "campaign_enrolled", label: "Campaign Enrolled", count: allIds.filter((id) => enrolledLeadIds.has(id)).length },
    { key: "contacted", label: "Contacted", count: allIds.filter((id) => sentLeadIds.has(id)).length },
    { key: "replied", label: "Replied", count: allIds.filter((id) => repliedLeadIds.has(id)).length },
    { key: "meeting", label: "Meeting", count: allIds.filter((id) => meetingLeadIds.has(id)).length },
    { key: "qualified", label: "Qualified", count: allIds.filter((id) => leadById.get(id)?.status === "Qualified" || leadById.get(id)?.status === "Converted").length },
    { key: "opportunity", label: "Opportunity", count: allIds.filter((id) => (oppsByLead.get(id) ?? []).length > 0).length },
    { key: "won", label: "Won", count: allIds.filter((id) => (oppsByLead.get(id) ?? []).some((o) => o.stage === "won")).length },
  ];
  const funnel: SegmentFunnelStage[] = funnelCounts.map((f, i) => ({
    ...f,
    conversionPercent: i === 0 ? 100 : funnelCounts[i - 1].count > 0 ? Math.round((f.count / funnelCounts[i - 1].count) * 1000) / 10 : 0,
  }));

  const activeCampaignsUsingSegments = new Set(campaigns.filter((c) => c.status === "Active" && c.segment_id).map((c) => c.segment_id)).size;

  return {
    hasAnyData: segments.length > 0,
    kpis: {
      totalSegments: segments.length,
      dynamicSegments: segments.filter((s) => s.segment_type === "Dynamic").length,
      staticSegments: segments.filter((s) => s.segment_type === "Static").length,
      averageSegmentSize: segments.length ? Math.round(members.length / segments.length) : 0,
      activeCampaignsUsingSegments,
    },
    performance,
    funnel,
    lastUpdatedAt: new Date().toISOString(),
  };
}
