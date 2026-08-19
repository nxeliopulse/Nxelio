"use server";
import { createClient } from "@/lib/supabase/server";
import { calcWinRate } from "@/lib/analytics/overview-metrics";
import { CLOSED_STAGES, type OpportunityStage } from "@/lib/opportunities";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";
import { getActiveQuotasByUser } from "@/lib/queries/sales-quotas";

export interface RepLeaderboardRow {
  userId: string;
  name: string;
  prospects: number;
  outreach: number;
  replies: number;
  meetings: number;
  qualified: number;
  opportunities: number;
  pipeline: number;
  revenue: number;
  winRate: number;
  /** Null when no per-rep quota (sales_quotas, keyed by user_id) covers today —
   *  set one under Administration → Sales Quotas to populate this. */
  target: number | null;
  attainmentPercent: number | null;
}

export interface ActivityBreakdownRow {
  channel: string;
  count: number;
}

export interface TeamAnalyticsData {
  hasAnyData: boolean;
  scopedToSelf: boolean;
  kpis: {
    prospectsAssigned: number;
    emailsSent: number;
    replies: number;
    meetings: number;
    qualifiedProspects: number;
    opportunities: number;
    pipelineGenerated: number;
    revenueWon: number;
    tasksCompleted: number;
  };
  leaderboard: RepLeaderboardRow[];
  activityBreakdown: ActivityBreakdownRow[];
  responseTime: {
    averageMinutes: number | null;
    medianMinutes: number | null;
    underOneHourPercent: number;
    overOneDayPercent: number;
  };
  lastUpdatedAt: string;
}

export async function getTeamAnalytics(): Promise<TeamAnalyticsData> {
  const supabase = await createClient();
  const ctx = await getAnalyticsContext();
  // Rep comparison is a Manager/Admin capability (doc §4) — a rep with no
  // direct reports sees only their own row, not the full team leaderboard.
  const scopedToSelf = !ctx.isAdmin && ctx.directReportIds.length === 0;
  const visibleUserIds = scopedToSelf ? [ctx.userId] : ctx.isAdmin ? null : [ctx.userId, ...ctx.directReportIds];

  const { data: usersData } = await supabase.from("users").select("user_id, full_name");
  const allUsers = (usersData as { user_id: string; full_name: string }[]) || [];
  const users = visibleUserIds ? allUsers.filter((u) => visibleUserIds.includes(u.user_id)) : allUsers;

  let leadsQuery = supabase.from("leads").select("id, owner_id, status");
  if (visibleUserIds) leadsQuery = leadsQuery.in("owner_id", visibleUserIds);
  const { data: leadsData } = await leadsQuery;
  const leads = (leadsData as { id: string; owner_id: string | null; status: string }[]) || [];
  const leadIds = leads.map((l) => l.id);

  let activities: { lead_id: string; activity_type: string }[] = [];
  let meetingLeadIds = new Set<string>();
  const oppsByOwner = new Map<string, { deal_value: number; stage: OpportunityStage }[]>();
  if (leadIds.length) {
    const [{ data: acts }, { data: meetings }] = await Promise.all([
      supabase.from("lead_activities").select("lead_id, activity_type").in("lead_id", leadIds).in("activity_type", ["EMAIL_SENT", "EMAIL_REPLIED", "LINKEDIN_AUTO_ASK_CONTACT_INFO"]),
      supabase.from("meetings").select("lead_id").in("lead_id", leadIds),
    ]);
    activities = (acts as typeof activities) || [];
    meetingLeadIds = new Set(((meetings as { lead_id: string | null }[]) || []).map((m) => m.lead_id).filter(Boolean) as string[]);
  }
  // Tasks Completed — this schema has no generic task system, only
  // per-contact and per-account task lists (contact_tasks/account_tasks),
  // so this is the sum of both, scoped to visible reps' assignments.
  let contactTasksQuery = supabase.from("contact_tasks").select("id", { count: "exact", head: true }).eq("status", "done");
  let accountTasksQuery = supabase.from("account_tasks").select("id", { count: "exact", head: true }).eq("status", "done");
  if (visibleUserIds) {
    contactTasksQuery = contactTasksQuery.in("assigned_to", visibleUserIds);
    accountTasksQuery = accountTasksQuery.in("assigned_to", visibleUserIds);
  }
  const [{ count: contactTasksDone }, { count: accountTasksDone }] = await Promise.all([contactTasksQuery, accountTasksQuery]);
  const tasksCompleted = (contactTasksDone ?? 0) + (accountTasksDone ?? 0);

  let oppsQuery = supabase.from("opportunities").select("owner_id, deal_value, stage");
  if (visibleUserIds) oppsQuery = oppsQuery.in("owner_id", visibleUserIds);
  const { data: oppsData } = await oppsQuery;
  for (const o of (oppsData as { owner_id: string | null; deal_value: number; stage: OpportunityStage }[]) || []) {
    if (!o.owner_id) continue;
    if (!oppsByOwner.has(o.owner_id)) oppsByOwner.set(o.owner_id, []);
    oppsByOwner.get(o.owner_id)!.push({ deal_value: o.deal_value, stage: o.stage });
  }

  const sentLeadIds = new Set(activities.filter((a) => a.activity_type === "EMAIL_SENT").map((a) => a.lead_id));
  const repliedLeadIds = new Set(activities.filter((a) => a.activity_type === "EMAIL_REPLIED").map((a) => a.lead_id));
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const quotasByUser = await getActiveQuotasByUser(new Date());

  const leaderboard: RepLeaderboardRow[] = users.map((u) => {
    const ownLeadIds = leads.filter((l) => l.owner_id === u.user_id).map((l) => l.id);
    const outreach = ownLeadIds.filter((id) => sentLeadIds.has(id)).length;
    const replies = ownLeadIds.filter((id) => repliedLeadIds.has(id)).length;
    const meetings = ownLeadIds.filter((id) => meetingLeadIds.has(id)).length;
    const qualified = ownLeadIds.filter((id) => leadById.get(id)?.status === "Qualified" || leadById.get(id)?.status === "Converted").length;
    const opps = oppsByOwner.get(u.user_id) ?? [];
    const won = opps.filter((o) => o.stage === "won");
    const lost = opps.filter((o) => o.stage === "lost");
    const open = opps.filter((o) => !CLOSED_STAGES.includes(o.stage));
    const revenue = won.reduce((s, o) => s + Number(o.deal_value || 0), 0);
    const quota = quotasByUser.get(u.user_id);
    return {
      userId: u.user_id,
      name: u.full_name,
      prospects: ownLeadIds.length,
      outreach,
      replies,
      meetings,
      qualified,
      opportunities: opps.length,
      pipeline: open.reduce((s, o) => s + Number(o.deal_value || 0), 0),
      revenue,
      winRate: calcWinRate(won.length, lost.length),
      target: quota?.targetAmount ?? null,
      attainmentPercent: quota && quota.targetAmount > 0 ? Math.round((revenue / quota.targetAmount) * 1000) / 10 : null,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const activityBreakdown: ActivityBreakdownRow[] = [
    { channel: "Email", count: activities.filter((a) => a.activity_type === "EMAIL_SENT").length },
    { channel: "LinkedIn", count: activities.filter((a) => a.activity_type === "LINKEDIN_AUTO_ASK_CONTACT_INFO").length },
    { channel: "Meeting", count: meetingLeadIds.size },
  ].filter((r) => r.count > 0);

  // Response Time — time from an inbound inbox message to the next outbound
  // message on the same lead (real data: inbox_messages.direction/created_at).
  const responseTimesMinutes: number[] = [];
  if (leadIds.length) {
    const { data: inboxData } = await supabase.from("inbox_messages").select("lead_id, direction, created_at").in("lead_id", leadIds).order("created_at", { ascending: true });
    const byLead = new Map<string, { direction: string; created_at: string }[]>();
    for (const m of (inboxData as { lead_id: string | null; direction: string; created_at: string }[]) || []) {
      if (!m.lead_id) continue;
      if (!byLead.has(m.lead_id)) byLead.set(m.lead_id, []);
      byLead.get(m.lead_id)!.push(m);
    }
    for (const messages of byLead.values()) {
      for (let i = 0; i < messages.length - 1; i++) {
        if (messages[i].direction === "inbound" && messages[i + 1].direction === "outbound") {
          const diffMinutes = (new Date(messages[i + 1].created_at).getTime() - new Date(messages[i].created_at).getTime()) / 60_000;
          if (diffMinutes >= 0) responseTimesMinutes.push(diffMinutes);
        }
      }
    }
  }
  responseTimesMinutes.sort((a, b) => a - b);
  const average = responseTimesMinutes.length ? Math.round(responseTimesMinutes.reduce((s, m) => s + m, 0) / responseTimesMinutes.length) : null;
  const median = responseTimesMinutes.length ? responseTimesMinutes[Math.floor(responseTimesMinutes.length / 2)] : null;
  const underOneHour = responseTimesMinutes.filter((m) => m <= 60).length;
  const overOneDay = responseTimesMinutes.filter((m) => m > 1440).length;

  return {
    hasAnyData: leads.length > 0,
    scopedToSelf,
    kpis: {
      prospectsAssigned: leads.length,
      emailsSent: activities.filter((a) => a.activity_type === "EMAIL_SENT").length,
      replies: leads.filter((l) => repliedLeadIds.has(l.id)).length,
      meetings: leads.filter((l) => meetingLeadIds.has(l.id)).length,
      qualifiedProspects: leads.filter((l) => l.status === "Qualified" || l.status === "Converted").length,
      opportunities: Array.from(oppsByOwner.values()).reduce((s, arr) => s + arr.length, 0),
      pipelineGenerated: Array.from(oppsByOwner.values()).flat().filter((o) => !CLOSED_STAGES.includes(o.stage)).reduce((s, o) => s + Number(o.deal_value || 0), 0),
      revenueWon: Array.from(oppsByOwner.values()).flat().filter((o) => o.stage === "won").reduce((s, o) => s + Number(o.deal_value || 0), 0),
      tasksCompleted,
    },
    leaderboard,
    activityBreakdown,
    responseTime: {
      averageMinutes: average,
      medianMinutes: median,
      underOneHourPercent: responseTimesMinutes.length ? Math.round((underOneHour / responseTimesMinutes.length) * 1000) / 10 : 0,
      overOneDayPercent: responseTimesMinutes.length ? Math.round((overOneDay / responseTimesMinutes.length) * 1000) / 10 : 0,
    },
    lastUpdatedAt: new Date().toISOString(),
  };
}
