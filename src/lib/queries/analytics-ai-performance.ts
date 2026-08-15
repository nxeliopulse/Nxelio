"use server";
import { createClient } from "@/lib/supabase/server";
import { AI_SCORE_BANDS } from "@/lib/analytics/prospects-metrics";
import { calcReplyRate, calcWinRate } from "@/lib/analytics/overview-metrics";
import { CLOSED_STAGES, type OpportunityStage } from "@/lib/opportunities";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";

// The real AI feature_key values this app charges credits under (see
// src/lib/ai/actions.ts's chargeCredits() call sites, plus ai_assistant/
// ai_column from assistant.ts/ai-columns.ts). campaign_send/newsletter_send
// are deliberately excluded — those are send-volume charges, not AI
// operations. This is the closest real "AI event log" this schema has;
// there's no dedicated ai_events table (see the doc's own §54 Phase-1 list,
// which explicitly calls for one as a separate, larger follow-up).
const AI_FEATURE_KEYS = [
  "email_sequence_generation", "lead_scoring", "company_intel", "contact_intel",
  "lead_outreach_generation", "next_steps_generation", "newsletter_generation",
  "email_improvement", "email_generation", "segment_rule_generation", "ai_assistant", "ai_column",
];

export interface ScoreBandOutcomeRow {
  label: string;
  min: number;
  max: number;
  count: number;
  replyRate: number;
  meetingRate: number;
  opportunityRate: number;
  winRate: number;
}

export interface FeatureUsageRow {
  feature: string;
  credits: number;
  uses: number;
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  conversionPercent: number;
}

export interface AiComparisonMetric {
  metric: string;
  aiAssisted: number;
  nonAiAssisted: number;
}

export interface AiInsight {
  id: string;
  title: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface AiPerformanceData {
  hasAnyData: boolean;
  kpis: {
    aiCreditsUsed: number;
    aiAssistedProspects: number;
    aiAssistedMeetings: number;
    aiInfluencedPipeline: number;
    aiInfluencedRevenue: number;
  };
  scoreBandOutcomes: ScoreBandOutcomeRow[];
  featureUsage: FeatureUsageRow[];
  aiAssistedFunnel: FunnelStage[];
  comparison: AiComparisonMetric[];
  insights: AiInsight[];
  lastUpdatedAt: string;
}

export async function getAiPerformanceAnalytics(): Promise<AiPerformanceData> {
  const supabase = await createClient();
  await getAnalyticsContext();

  const [{ data: leadsData }, { data: creditData }] = await Promise.all([
    supabase.from("leads").select("id, lead_score, status, created_at"),
    supabase.from("credit_transactions").select("feature_key, amount").eq("type", "debit").in("feature_key", AI_FEATURE_KEYS),
  ]);
  const leads = (leadsData as { id: string; lead_score: number; status: string; created_at: string }[]) || [];
  const credits = (creditData as { feature_key: string | null; amount: number }[]) || [];

  const aiAssistedLeadIds = leads.filter((l) => (l.lead_score || 0) > 0).map((l) => l.id);
  const nonAiLeadIds = leads.filter((l) => !(l.lead_score > 0)).map((l) => l.id);
  const allLeadIds = leads.map((l) => l.id);

  let activities: { lead_id: string; activity_type: string }[] = [];
  let meetingLeadIds = new Set<string>();
  let oppsByLead = new Map<string, { deal_value: number; stage: OpportunityStage; lead_id: string }[]>();
  if (allLeadIds.length) {
    const [{ data: acts }, { data: meetings }, { data: opps }] = await Promise.all([
      supabase.from("lead_activities").select("lead_id, activity_type").in("lead_id", allLeadIds).in("activity_type", ["EMAIL_SENT", "EMAIL_REPLIED"]),
      supabase.from("meetings").select("lead_id").in("lead_id", allLeadIds),
      supabase.from("opportunities").select("lead_id, deal_value, stage").in("lead_id", allLeadIds),
    ]);
    activities = (acts as typeof activities) || [];
    meetingLeadIds = new Set(((meetings as { lead_id: string | null }[]) || []).map((m) => m.lead_id).filter(Boolean) as string[]);
    for (const o of (opps as { lead_id: string | null; deal_value: number; stage: OpportunityStage }[]) || []) {
      if (!o.lead_id) continue;
      if (!oppsByLead.has(o.lead_id)) oppsByLead.set(o.lead_id, []);
      oppsByLead.get(o.lead_id)!.push({ ...o, lead_id: o.lead_id });
    }
  }
  const sentLeadIds = new Set(activities.filter((a) => a.activity_type === "EMAIL_SENT").map((a) => a.lead_id));
  const repliedLeadIds = new Set(activities.filter((a) => a.activity_type === "EMAIL_REPLIED").map((a) => a.lead_id));

  function groupMetrics(ids: string[]) {
    const sent = ids.filter((id) => sentLeadIds.has(id)).length;
    const replied = ids.filter((id) => repliedLeadIds.has(id)).length;
    const meetings = ids.filter((id) => meetingLeadIds.has(id)).length;
    const opps = ids.flatMap((id) => oppsByLead.get(id) ?? []);
    const won = opps.filter((o) => o.stage === "won").length;
    const lost = opps.filter((o) => o.stage === "lost").length;
    return {
      replyRate: calcReplyRate(replied, sent || ids.length || 1),
      meetingRate: ids.length ? Math.round((meetings / ids.length) * 1000) / 10 : 0,
      opportunityRate: ids.length ? Math.round((opps.length / ids.length) * 1000) / 10 : 0,
      winRate: calcWinRate(won, lost),
    };
  }

  const aiMetrics = groupMetrics(aiAssistedLeadIds);
  const nonAiMetrics = groupMetrics(nonAiLeadIds);
  const comparison: AiComparisonMetric[] = [
    { metric: "Reply Rate", aiAssisted: aiMetrics.replyRate, nonAiAssisted: nonAiMetrics.replyRate },
    { metric: "Meeting Rate", aiAssisted: aiMetrics.meetingRate, nonAiAssisted: nonAiMetrics.meetingRate },
    { metric: "Opportunity Rate", aiAssisted: aiMetrics.opportunityRate, nonAiAssisted: nonAiMetrics.opportunityRate },
    { metric: "Win Rate", aiAssisted: aiMetrics.winRate, nonAiAssisted: nonAiMetrics.winRate },
  ];

  // Score band outcomes (reuses the same bands as Prospects Analytics)
  const scoreBandOutcomes: ScoreBandOutcomeRow[] = AI_SCORE_BANDS.map((band) => {
    const inBand = leads.filter((l) => (l.lead_score || 0) >= band.min && (l.lead_score || 0) <= band.max).map((l) => l.id);
    const m = groupMetrics(inBand);
    return { label: band.label, min: band.min, max: band.max, count: inBand.length, ...m };
  });

  // Feature usage / credits
  const usageByFeature = new Map<string, { credits: number; uses: number }>();
  for (const c of credits) {
    const key = c.feature_key || "Other";
    if (!usageByFeature.has(key)) usageByFeature.set(key, { credits: 0, uses: 0 });
    const bucket = usageByFeature.get(key)!;
    bucket.credits += Math.abs(c.amount);
    bucket.uses += 1;
  }
  const featureUsage: FeatureUsageRow[] = Array.from(usageByFeature.entries()).map(([feature, v]) => ({ feature, ...v })).sort((a, b) => b.credits - a.credits);
  const aiCreditsUsed = featureUsage.reduce((s, f) => s + f.credits, 0);

  // AI-Assisted Funnel — same shape as Overview's, restricted to AI-scored leads.
  const aiOpps = aiAssistedLeadIds.flatMap((id) => oppsByLead.get(id) ?? []);
  const funnelCounts = [
    { key: "ai_scored", label: "AI Scored", count: aiAssistedLeadIds.length },
    { key: "contacted", label: "Contacted", count: aiAssistedLeadIds.filter((id) => sentLeadIds.has(id)).length },
    { key: "replied", label: "Replied", count: aiAssistedLeadIds.filter((id) => repliedLeadIds.has(id)).length },
    { key: "meeting", label: "Meeting", count: aiAssistedLeadIds.filter((id) => meetingLeadIds.has(id)).length },
    { key: "opportunity", label: "Opportunity", count: new Set(aiOpps.map((o) => o.lead_id)).size },
    { key: "won", label: "Closed Won", count: new Set(aiOpps.filter((o) => o.stage === "won").map((o) => o.lead_id)).size },
  ];
  const aiAssistedFunnel: FunnelStage[] = funnelCounts.map((f, i) => ({
    ...f,
    conversionPercent: i === 0 ? 100 : funnelCounts[i - 1].count > 0 ? Math.round((f.count / funnelCounts[i - 1].count) * 1000) / 10 : 0,
  }));

  const aiInfluencedPipeline = aiOpps.filter((o) => !CLOSED_STAGES.includes(o.stage)).reduce((s, o) => s + Number(o.deal_value || 0), 0);
  const aiInfluencedRevenue = aiOpps.filter((o) => o.stage === "won").reduce((s, o) => s + Number(o.deal_value || 0), 0);

  const insights: AiInsight[] = [];
  if (aiMetrics.replyRate > nonAiMetrics.replyRate && aiAssistedLeadIds.length > 0) {
    insights.push({ id: "ai_reply_lift", title: `AI-scored prospects reply at ${aiMetrics.replyRate}% vs ${nonAiMetrics.replyRate}% for unscored prospects.`, ctaLabel: "View Prospects", ctaHref: "/analytics/prospects" });
  }
  const topBand = scoreBandOutcomes[0];
  if (topBand && topBand.count > 0) {
    insights.push({ id: "top_band", title: `${topBand.label}-score prospects convert to meetings at ${topBand.meetingRate}%.`, ctaLabel: "View Prospects", ctaHref: "/leads" });
  }
  const topFeature = featureUsage[0];
  if (topFeature) {
    insights.push({ id: "top_feature", title: `${topFeature.feature.replace(/_/g, " ")} is your most-used AI feature (${topFeature.credits} credits).`, ctaLabel: "View Usage", ctaHref: "/billing" });
  }

  return {
    hasAnyData: leads.length > 0,
    kpis: {
      aiCreditsUsed,
      aiAssistedProspects: aiAssistedLeadIds.length,
      aiAssistedMeetings: aiAssistedLeadIds.filter((id) => meetingLeadIds.has(id)).length,
      aiInfluencedPipeline,
      aiInfluencedRevenue,
    },
    scoreBandOutcomes,
    featureUsage,
    aiAssistedFunnel,
    comparison,
    insights: insights.slice(0, 5),
    lastUpdatedAt: new Date().toISOString(),
  };
}
