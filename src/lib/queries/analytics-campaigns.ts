"use server";
import { createClient } from "@/lib/supabase/server";
import { resolveDateRangePreset, calcReplyRate, calcQualificationRate, type DateRangePreset } from "@/lib/analytics/overview-metrics";
import { CLOSED_STAGES, type OpportunityStage } from "@/lib/opportunities";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";

export interface CampaignsFilters {
  dateRange: DateRangePreset;
  customFrom?: string;
  customTo?: string;
  status?: string;
  campaignId?: string; // scopes the Step Analytics table to one campaign
}

export interface CampaignPerformanceRow {
  id: string;
  name: string;
  segment: string | null;
  sent: number;
  delivered: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  meetings: number;
  qualified: number;
  opportunities: number;
  pipeline: number;
  revenue: number;
  status: string;
}

export interface StepAnalyticsRow {
  stepOrder: number;
  sent: number;
  failed: number;
  skipped: number;
  conversionToNextPercent: number;
}

export interface CampaignsAnalyticsData {
  hasAnyData: boolean;
  kpis: {
    totalCampaigns: number;
    active: number;
    paused: number;
    completed: number;
    prospectsEnrolled: number;
    averageReplyRate: number;
    averageMeetingRate: number;
    qualificationRate: number;
    pipelineGenerated: number;
    revenueGenerated: number;
  };
  performance: CampaignPerformanceRow[];
  stepAnalytics: StepAnalyticsRow[];
  lastUpdatedAt: string;
}

export async function getCampaignsAnalytics(filters: CampaignsFilters): Promise<CampaignsAnalyticsData> {
  const supabase = await createClient();
  await getAnalyticsContext();

  let campaignsQuery = supabase.from("campaigns").select("id, campaign_name, segment_id, status, sent_count, open_rate, reply_rate, bounce_rate");
  if (filters.status) campaignsQuery = campaignsQuery.eq("status", filters.status);
  const [{ data: campaignsData }, { data: segmentsData }, { data: enrollmentsData }] = await Promise.all([
    campaignsQuery,
    supabase.from("segments").select("id, segment_name"),
    supabase.from("campaign_enrollments").select("campaign_id, lead_id, status"),
  ]);
  const campaigns = (campaignsData as { id: string; campaign_name: string; segment_id: string | null; status: string; sent_count: number; open_rate: number; reply_rate: number; bounce_rate: number }[]) || [];
  const segmentNameById = new Map(((segmentsData as { id: string; segment_name: string }[]) || []).map((s) => [s.id, s.segment_name]));
  const enrollments = (enrollmentsData as { campaign_id: string; lead_id: string; status: string }[]) || [];

  const campaignIds = campaigns.map((c) => c.id);
  const enrolledLeadIdsByCampaign = new Map<string, Set<string>>();
  for (const e of enrollments) {
    if (!enrolledLeadIdsByCampaign.has(e.campaign_id)) enrolledLeadIdsByCampaign.set(e.campaign_id, new Set());
    enrolledLeadIdsByCampaign.get(e.campaign_id)!.add(e.lead_id);
  }
  const allEnrolledLeadIds = Array.from(new Set(enrollments.map((e) => e.lead_id)));

  let leadStatusById = new Map<string, string>();
  let activityRows: { lead_id: string; activity_type: string; metadata: { campaign_id?: string } | null }[] = [];
  let meetingLeadIds = new Set<string>();
  let oppsByCampaign = new Map<string, { deal_value: number; stage: OpportunityStage }[]>();

  if (allEnrolledLeadIds.length) {
    const [{ data: leadRows }, { data: acts }, { data: meetings }] = await Promise.all([
      supabase.from("leads").select("id, status").in("id", allEnrolledLeadIds),
      supabase.from("lead_activities").select("lead_id, activity_type, metadata").in("lead_id", allEnrolledLeadIds).in("activity_type", ["EMAIL_CLICKED", "EMAIL_REPLIED"]),
      supabase.from("meetings").select("lead_id").in("lead_id", allEnrolledLeadIds),
    ]);
    leadStatusById = new Map(((leadRows as { id: string; status: string }[]) || []).map((l) => [l.id, l.status]));
    activityRows = (acts as typeof activityRows) || [];
    meetingLeadIds = new Set(((meetings as { lead_id: string | null }[]) || []).map((m) => m.lead_id).filter(Boolean) as string[]);
  }
  if (campaignIds.length) {
    const { data: opps } = await supabase.from("opportunities").select("campaign_id, deal_value, stage").in("campaign_id", campaignIds);
    for (const o of (opps as { campaign_id: string | null; deal_value: number; stage: OpportunityStage }[]) || []) {
      if (!o.campaign_id) continue;
      if (!oppsByCampaign.has(o.campaign_id)) oppsByCampaign.set(o.campaign_id, []);
      oppsByCampaign.get(o.campaign_id)!.push({ deal_value: o.deal_value, stage: o.stage });
    }
  }

  const clickLeadIds = new Set(activityRows.filter((a) => a.activity_type === "EMAIL_CLICKED").map((a) => a.lead_id));
  const replyLeadIds = new Set(activityRows.filter((a) => a.activity_type === "EMAIL_REPLIED").map((a) => a.lead_id));

  const performance: CampaignPerformanceRow[] = campaigns.map((c) => {
    const enrolledIds = Array.from(enrolledLeadIdsByCampaign.get(c.id) ?? []);
    const clicks = enrolledIds.filter((id) => clickLeadIds.has(id)).length;
    const replies = enrolledIds.filter((id) => replyLeadIds.has(id)).length;
    const meetings = enrolledIds.filter((id) => meetingLeadIds.has(id)).length;
    const qualified = enrolledIds.filter((id) => leadStatusById.get(id) === "Qualified" || leadStatusById.get(id) === "Converted").length;
    const opps = oppsByCampaign.get(c.id) ?? [];
    const won = opps.filter((o) => o.stage === "won");
    const open = opps.filter((o) => !CLOSED_STAGES.includes(o.stage));
    return {
      id: c.id,
      name: c.campaign_name,
      segment: c.segment_id ? segmentNameById.get(c.segment_id) ?? null : null,
      sent: c.sent_count || 0,
      delivered: Math.round((c.sent_count || 0) * (1 - (c.bounce_rate || 0) / 100)),
      openRate: c.open_rate || 0,
      clickRate: enrolledIds.length ? Math.round((clicks / enrolledIds.length) * 1000) / 10 : 0,
      replyRate: c.reply_rate || calcReplyRate(replies, enrolledIds.length || 1),
      meetings,
      qualified,
      opportunities: opps.length,
      pipeline: open.reduce((sum, o) => sum + Number(o.deal_value || 0), 0),
      revenue: won.reduce((sum, o) => sum + Number(o.deal_value || 0), 0),
      status: c.status,
    };
  });
  performance.sort((a, b) => b.revenue - a.revenue);

  // Step Analytics (doc's "Sequence Step Analytics") — campaign_jobs is this
  // app's real per-step send queue; the standalone `sequences` table is
  // unused dead schema (confirmed: no query anywhere references it), so
  // steps are read from campaign_jobs instead, optionally scoped to one
  // campaign via filters.campaignId.
  let jobsQuery = supabase.from("campaign_jobs").select("step_order, status");
  if (filters.campaignId) jobsQuery = jobsQuery.eq("campaign_id", filters.campaignId);
  else if (campaignIds.length) jobsQuery = jobsQuery.in("campaign_id", campaignIds);
  const { data: jobsData } = campaignIds.length || filters.campaignId ? await jobsQuery : { data: [] };
  const jobs = (jobsData as { step_order: number; status: string }[]) || [];
  const byStep = new Map<number, { sent: number; failed: number; skipped: number; total: number }>();
  for (const j of jobs) {
    if (!byStep.has(j.step_order)) byStep.set(j.step_order, { sent: 0, failed: 0, skipped: 0, total: 0 });
    const bucket = byStep.get(j.step_order)!;
    bucket.total += 1;
    if (j.status === "sent") bucket.sent += 1;
    if (j.status === "failed") bucket.failed += 1;
    if (j.status === "skipped") bucket.skipped += 1;
  }
  const stepOrders = Array.from(byStep.keys()).sort((a, b) => a - b);
  const stepAnalytics: StepAnalyticsRow[] = stepOrders.map((step, i) => {
    const bucket = byStep.get(step)!;
    const nextTotal = i < stepOrders.length - 1 ? byStep.get(stepOrders[i + 1])!.total : 0;
    return {
      stepOrder: step,
      sent: bucket.sent,
      failed: bucket.failed,
      skipped: bucket.skipped,
      conversionToNextPercent: i < stepOrders.length - 1 && bucket.total > 0 ? Math.round((nextTotal / bucket.total) * 1000) / 10 : 0,
    };
  });

  const activeCampaigns = campaigns.filter((c) => c.status === "Active");
  const totalQualified = performance.reduce((s, p) => s + p.qualified, 0);
  const totalMeetings = performance.reduce((s, p) => s + p.meetings, 0);

  return {
    hasAnyData: campaigns.length > 0,
    kpis: {
      totalCampaigns: campaigns.length,
      active: activeCampaigns.length,
      paused: campaigns.filter((c) => c.status === "Paused").length,
      completed: campaigns.filter((c) => c.status === "Completed").length,
      prospectsEnrolled: allEnrolledLeadIds.length,
      averageReplyRate: performance.length ? Math.round((performance.reduce((s, p) => s + p.replyRate, 0) / performance.length) * 10) / 10 : 0,
      averageMeetingRate: allEnrolledLeadIds.length ? Math.round((totalMeetings / allEnrolledLeadIds.length) * 1000) / 10 : 0,
      qualificationRate: calcQualificationRate(totalQualified, totalMeetings || 1),
      pipelineGenerated: performance.reduce((s, p) => s + p.pipeline, 0),
      revenueGenerated: performance.reduce((s, p) => s + p.revenue, 0),
    },
    performance,
    stepAnalytics,
    lastUpdatedAt: new Date().toISOString(),
  };
}
