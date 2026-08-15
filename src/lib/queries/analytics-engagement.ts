"use server";
import { createClient } from "@/lib/supabase/server";
import { resolveDateRangePreset, bucketDateRange, type DateRangePreset, type DateRange } from "@/lib/analytics/overview-metrics";
import { classifyReplyHeuristic, dayHourBucket, HOUR_BLOCK_LABELS, DAY_LABELS, type ReplyClassification } from "@/lib/analytics/engagement-metrics";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";

export interface EngagementFilters {
  dateRange: DateRangePreset;
  customFrom?: string;
  customTo?: string;
  campaignId?: string;
}

export interface EngagementTrendPoint {
  bucketLabel: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
}

export interface ChannelRow {
  channel: string;
  attempts: number;
  replyRate: number;
  meetings: number;
  opportunityConversion: number;
}

export interface SubjectRow {
  subject: string;
  sent: number;
  openRate: number;
  replyRate: number;
  meetingsGenerated: number;
}

export interface HeatmapCell {
  day: string;
  hourBlock: string;
  value: number;
}

export interface ReplyClassificationRow {
  label: ReplyClassification;
  count: number;
  percent: number;
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  conversionPercent: number;
}

export interface EngagementAnalyticsData {
  hasAnyData: boolean;
  granularity: "daily" | "weekly" | "monthly";
  kpis: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replies: number;
    positiveReplies: number;
  };
  rates: {
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    replyRate: number;
    positiveReplyRate: number;
    bounceRate: number;
    unsubscribeRate: number;
  };
  trend: EngagementTrendPoint[];
  byChannel: ChannelRow[];
  subjectPerformance: SubjectRow[];
  heatmap: HeatmapCell[];
  replyClassification: ReplyClassificationRow[];
  funnel: FunnelStage[];
  bounceWarning: string | null;
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

export async function getEngagementAnalytics(filters: EngagementFilters): Promise<EngagementAnalyticsData> {
  const supabase = await createClient();
  await getAnalyticsContext();
  const now = new Date();
  const range: DateRange =
    filters.dateRange === "custom" && filters.customFrom && filters.customTo
      ? { from: new Date(filters.customFrom), to: new Date(filters.customTo) }
      : resolveDateRangePreset(filters.dateRange === "custom" ? "last_30_days" : filters.dateRange, now);

  let activitiesQuery = supabase
    .from("lead_activities")
    .select("lead_id, activity_type, created_at, metadata")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .in("activity_type", ["EMAIL_SENT", "EMAIL_OPENED", "EMAIL_CLICKED", "EMAIL_REPLIED", "EMAIL_BOUNCED", "EMAIL_UNSUBSCRIBED", "LINKEDIN_AUTO_ASK_CONTACT_INFO"]);
  if (filters.campaignId) activitiesQuery = activitiesQuery.eq("metadata->>campaign_id", filters.campaignId);

  const [{ data: activityData }, { data: campaignsData }, { data: repliesInboxData }, { data: meetingsData }] = await Promise.all([
    activitiesQuery,
    supabase.from("campaigns").select("id, campaign_name, subject"),
    supabase.from("inbox_messages").select("lead_id, campaign_id, body, created_at").eq("direction", "inbound").gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString()),
    supabase.from("meetings").select("lead_id"),
  ]);

  const activities = (activityData as { lead_id: string; activity_type: string; created_at: string; metadata: { campaign_id?: string } | null }[]) || [];
  const campaigns = (campaignsData as { id: string; campaign_name: string; subject: string | null }[]) || [];
  const inboundReplies = (repliesInboxData as { lead_id: string | null; campaign_id: string | null; body: string | null; created_at: string }[]) || [];
  const meetingLeadIds = new Set(((meetingsData as { lead_id: string | null }[]) || []).map((m) => m.lead_id).filter(Boolean) as string[]);

  const sentRows = activities.filter((a) => a.activity_type === "EMAIL_SENT");
  const openedRows = activities.filter((a) => a.activity_type === "EMAIL_OPENED");
  const clickedRows = activities.filter((a) => a.activity_type === "EMAIL_CLICKED");
  const repliedRows = activities.filter((a) => a.activity_type === "EMAIL_REPLIED");
  const bouncedRows = activities.filter((a) => a.activity_type === "EMAIL_BOUNCED");
  const unsubscribedRows = activities.filter((a) => a.activity_type === "EMAIL_UNSUBSCRIBED");
  const linkedinRows = activities.filter((a) => a.activity_type === "LINKEDIN_AUTO_ASK_CONTACT_INFO");

  const sentCount = sentRows.length;
  const deliveredCount = Math.max(sentCount - bouncedRows.length, 0);
  const uniqueOpens = new Set(openedRows.map((a) => a.lead_id)).size;
  const uniqueClicks = new Set(clickedRows.map((a) => a.lead_id)).size;
  const uniqueReplies = new Set(repliedRows.map((a) => a.lead_id)).size;

  // Reply classification (rule-based — see engagement-metrics.ts).
  const classified = inboundReplies.map((r) => classifyReplyHeuristic(r.body || ""));
  const classificationCounts = new Map<ReplyClassification, number>();
  for (const c of classified) classificationCounts.set(c, (classificationCounts.get(c) || 0) + 1);
  const positiveReplies = (classificationCounts.get("Positive") || 0) + (classificationCounts.get("Meeting Request") || 0);
  const replyClassification: ReplyClassificationRow[] = Array.from(classificationCounts.entries())
    .map(([label, count]) => ({ label, count, percent: classified.length ? Math.round((count / classified.length) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count);

  const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

  // Trend
  const granularity = bucketDateRange(range);
  const buckets = new Map<string, EngagementTrendPoint>();
  const order: string[] = [];
  const step = granularity === "monthly" ? 30 : granularity === "weekly" ? 7 : 1;
  for (let t = new Date(range.from); t <= range.to; t.setDate(t.getDate() + step)) {
    const label = bucketLabelFor(t, granularity);
    if (!buckets.has(label)) {
      buckets.set(label, { bucketLabel: label, sent: 0, opened: 0, clicked: 0, replied: 0 });
      order.push(label);
    }
  }
  for (const a of activities) {
    const label = bucketLabelFor(new Date(a.created_at), granularity);
    const bucket = buckets.get(label);
    if (!bucket) continue;
    if (a.activity_type === "EMAIL_SENT") bucket.sent += 1;
    else if (a.activity_type === "EMAIL_OPENED") bucket.opened += 1;
    else if (a.activity_type === "EMAIL_CLICKED") bucket.clicked += 1;
    else if (a.activity_type === "EMAIL_REPLIED") bucket.replied += 1;
  }
  const trend = order.map((label) => buckets.get(label)!);

  // By Channel — only Email and LinkedIn have real signal in this schema.
  const emailAttempts = sentCount;
  const emailReplies = uniqueReplies;
  const emailOppLeadIds = new Set([...repliedRows, ...clickedRows].map((a) => a.lead_id));
  const linkedinAttempts = linkedinRows.length;
  const linkedinLeadIds = new Set(linkedinRows.map((a) => a.lead_id));
  const byChannel: ChannelRow[] = [
    { channel: "Email", attempts: emailAttempts, replyRate: rate(emailReplies, deliveredCount), meetings: Array.from(emailOppLeadIds).filter((id) => meetingLeadIds.has(id)).length, opportunityConversion: 0 },
  ];
  if (linkedinAttempts > 0) {
    byChannel.push({ channel: "LinkedIn", attempts: linkedinAttempts, replyRate: 0, meetings: Array.from(linkedinLeadIds).filter((id) => meetingLeadIds.has(id)).length, opportunityConversion: 0 });
  }

  // Subject Line Performance — campaigns.subject is one subject per
  // campaign (no per-message subject variants tracked), so each campaign's
  // fixed subject is one row.
  const sentByCampaign = new Map<string, number>();
  const openedByCampaign = new Map<string, Set<string>>();
  const repliedByCampaign = new Map<string, Set<string>>();
  const meetingsByCampaign = new Map<string, number>();
  for (const a of activities) {
    const cid = a.metadata?.campaign_id;
    if (!cid) continue;
    if (a.activity_type === "EMAIL_SENT") sentByCampaign.set(cid, (sentByCampaign.get(cid) || 0) + 1);
    if (a.activity_type === "EMAIL_OPENED") {
      if (!openedByCampaign.has(cid)) openedByCampaign.set(cid, new Set());
      openedByCampaign.get(cid)!.add(a.lead_id);
    }
    if (a.activity_type === "EMAIL_REPLIED") {
      if (!repliedByCampaign.has(cid)) repliedByCampaign.set(cid, new Set());
      repliedByCampaign.get(cid)!.add(a.lead_id);
      if (meetingLeadIds.has(a.lead_id)) meetingsByCampaign.set(cid, (meetingsByCampaign.get(cid) || 0) + 1);
    }
  }
  const subjectPerformance: SubjectRow[] = campaigns
    .filter((c) => c.subject && (sentByCampaign.get(c.id) || 0) > 0)
    .map((c) => {
      const sent = sentByCampaign.get(c.id) || 0;
      return {
        subject: c.subject!,
        sent,
        openRate: rate(openedByCampaign.get(c.id)?.size || 0, sent),
        replyRate: rate(repliedByCampaign.get(c.id)?.size || 0, sent),
        meetingsGenerated: meetingsByCampaign.get(c.id) || 0,
      };
    })
    .sort((a, b) => b.replyRate - a.replyRate);

  // Best Time / Day Heatmap — Reply Rate cells (replies per bucket / sends
  // per bucket), the metric most directly tied to "when should we send."
  const sendsByBucket = new Map<string, number>();
  const repliesByBucket = new Map<string, number>();
  for (const a of sentRows) {
    const { day, hourBlock } = dayHourBucket(new Date(a.created_at));
    const key = `${day}|${hourBlock}`;
    sendsByBucket.set(key, (sendsByBucket.get(key) || 0) + 1);
  }
  for (const a of repliedRows) {
    const { day, hourBlock } = dayHourBucket(new Date(a.created_at));
    const key = `${day}|${hourBlock}`;
    repliesByBucket.set(key, (repliesByBucket.get(key) || 0) + 1);
  }
  const heatmap: HeatmapCell[] = [];
  for (const day of DAY_LABELS) {
    for (const hourBlock of HOUR_BLOCK_LABELS) {
      const key = `${day}|${hourBlock}`;
      heatmap.push({ day, hourBlock, value: rate(repliesByBucket.get(key) || 0, sendsByBucket.get(key) || 0) });
    }
  }

  // Engagement funnel
  const funnelCounts = [
    { key: "sent", label: "Sent", count: sentCount },
    { key: "delivered", label: "Delivered", count: deliveredCount },
    { key: "opened", label: "Opened", count: uniqueOpens },
    { key: "clicked", label: "Clicked", count: uniqueClicks },
    { key: "replied", label: "Replied", count: uniqueReplies },
    { key: "positive_reply", label: "Positive Reply", count: positiveReplies },
    { key: "meeting", label: "Meeting", count: Array.from(new Set(repliedRows.map((a) => a.lead_id))).filter((id) => meetingLeadIds.has(id)).length },
  ];
  const funnel: FunnelStage[] = funnelCounts.map((f, i) => ({
    ...f,
    conversionPercent: i === 0 ? 100 : funnelCounts[i - 1].count > 0 ? Math.round((f.count / funnelCounts[i - 1].count) * 1000) / 10 : 0,
  }));

  const bounceRateValue = rate(bouncedRows.length, sentCount);
  const bounceWarning = bounceRateValue > 5 ? `Bounce rate is ${bounceRateValue}% for the selected period — review your send list.` : null;

  return {
    hasAnyData: sentCount > 0 || campaigns.length > 0,
    granularity,
    kpis: { sent: sentCount, delivered: deliveredCount, opened: uniqueOpens, clicked: uniqueClicks, replies: uniqueReplies, positiveReplies },
    rates: {
      deliveryRate: rate(deliveredCount, sentCount),
      openRate: rate(uniqueOpens, deliveredCount),
      clickRate: rate(uniqueClicks, deliveredCount),
      replyRate: rate(uniqueReplies, deliveredCount),
      positiveReplyRate: rate(positiveReplies, deliveredCount),
      bounceRate: bounceRateValue,
      unsubscribeRate: rate(unsubscribedRows.length, deliveredCount),
    },
    trend,
    byChannel,
    subjectPerformance,
    heatmap,
    replyClassification,
    funnel,
    bounceWarning,
    lastUpdatedAt: new Date().toISOString(),
  };
}
