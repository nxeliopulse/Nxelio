"use server";
import { createClient } from "@/lib/supabase/server";
import { AI_SCORE_BANDS } from "@/lib/analytics/prospects-metrics";
import { calcReplyRate, calcWinRate } from "@/lib/analytics/overview-metrics";
import { CLOSED_STAGES, type OpportunityStage } from "@/lib/opportunities";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";
import { getSubscription } from "@/lib/queries/subscriptions";
import { getRecommendationAdoption } from "@/lib/queries/ai-recommendations";

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
    creditsRemaining: number | null;
    aiAssistedProspects: number;
    aiAssistedMeetings: number;
    aiInfluencedPipeline: number;
    aiInfluencedRevenue: number;
    enrichmentSuccessRate: number;
  };
  /** Recommendation lifecycle across the 8 analytics pages that surface AI
   *  Insights (migration 0130) — how many were ever surfaced, how many the
   *  user accepted vs dismissed, and the resulting rates. */
  recommendations: {
    totalSurfaced: number;
    accepted: number;
    dismissed: number;
    adoptionRatePercent: number;
    outcomeRatePercent: number | null;
  };
  scoreBandOutcomes: ScoreBandOutcomeRow[];
  featureUsage: FeatureUsageRow[];
  aiAssistedFunnel: FunnelStage[];
  comparison: AiComparisonMetric[];
  avgDealSizeComparison: { aiAssisted: number; nonAiAssisted: number };
  insights: AiInsight[];
  lastUpdatedAt: string;
}

export async function getAiPerformanceAnalytics(): Promise<AiPerformanceData> {
  const supabase = await createClient();
  await getAnalyticsContext();

  const [{ data: leadsData }, { data: creditData }, subscription, recommendations] = await Promise.all([
    supabase.from("leads").select("id, lead_score, status, created_at, industry, linkedin, website_url"),
    supabase.from("credit_transactions").select("feature_key, amount").eq("type", "debit").in("feature_key", AI_FEATURE_KEYS),
    getSubscription(),
    getRecommendationAdoption(),
  ]);
  const leads = (leadsData as { id: string; lead_score: number; status: string; created_at: string; industry: string | null; linkedin: string | null; website_url: string | null }[]) || [];
  const credits = (creditData as { feature_key: string | null; amount: number }[]) || [];
  const enrichedCount = leads.filter((l) => l.industry && (l.linkedin || l.website_url)).length;
  const enrichmentSuccessRate = leads.length ? Math.round((enrichedCount / leads.length) * 1000) / 10 : 0;

  const aiAssistedLeadIds = leads.filter((l) => (l.lead_score || 0) > 0).map((l) => l.id);
  const nonAiLeadIds = leads.filter((l) => !(l.lead_score > 0)).map((l) => l.id);
  const allLeadIds = leads.map((l) => l.id);

  let activities: { lead_id: string; activity_type: string }[] = [];
  let meetingLeadIds = new Set<string>();
  const oppsByLead = new Map<string, { deal_value: number; stage: OpportunityStage; lead_id: string }[]>();
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

  const leadById = new Map(leads.map((l) => [l.id, l]));
  function groupMetrics(ids: string[]) {
    const sent = ids.filter((id) => sentLeadIds.has(id)).length;
    const replied = ids.filter((id) => repliedLeadIds.has(id)).length;
    const meetings = ids.filter((id) => meetingLeadIds.has(id)).length;
    const qualified = ids.filter((id) => leadById.get(id)?.status === "Qualified" || leadById.get(id)?.status === "Converted").length;
    const opps = ids.flatMap((id) => oppsByLead.get(id) ?? []);
    const won = opps.filter((o) => o.stage === "won");
    const lost = opps.filter((o) => o.stage === "lost").length;
    return {
      replyRate: calcReplyRate(replied, sent || ids.length || 1),
      meetingRate: ids.length ? Math.round((meetings / ids.length) * 1000) / 10 : 0,
      opportunityRate: ids.length ? Math.round((opps.length / ids.length) * 1000) / 10 : 0,
      winRate: calcWinRate(won.length, lost),
      qualificationRate: ids.length ? Math.round((qualified / ids.length) * 1000) / 10 : 0,
      avgDealSize: won.length ? Math.round(won.reduce((s, o) => s + Number(o.deal_value || 0), 0) / won.length) : 0,
    };
  }

  const aiMetrics = groupMetrics(aiAssistedLeadIds);
  const nonAiMetrics = groupMetrics(nonAiLeadIds);
  // Percentage-rate metrics only — avgDealSize is a dollar figure and would
  // break the shared 0-100% axis if mixed into this same chart, so it's
  // surfaced separately below.
  const comparison: AiComparisonMetric[] = [
    { metric: "Reply Rate", aiAssisted: aiMetrics.replyRate, nonAiAssisted: nonAiMetrics.replyRate },
    { metric: "Meeting Rate", aiAssisted: aiMetrics.meetingRate, nonAiAssisted: nonAiMetrics.meetingRate },
    { metric: "Qualification Rate", aiAssisted: aiMetrics.qualificationRate, nonAiAssisted: nonAiMetrics.qualificationRate },
    { metric: "Opportunity Rate", aiAssisted: aiMetrics.opportunityRate, nonAiAssisted: nonAiMetrics.opportunityRate },
    { metric: "Win Rate", aiAssisted: aiMetrics.winRate, nonAiAssisted: nonAiMetrics.winRate },
  ];
  const avgDealSizeComparison = { aiAssisted: aiMetrics.avgDealSize, nonAiAssisted: nonAiMetrics.avgDealSize };

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
      creditsRemaining: subscription?.credits_remaining ?? null,
      aiAssistedProspects: aiAssistedLeadIds.length,
      aiAssistedMeetings: aiAssistedLeadIds.filter((id) => meetingLeadIds.has(id)).length,
      aiInfluencedPipeline,
      aiInfluencedRevenue,
      enrichmentSuccessRate,
    },
    recommendations,
    scoreBandOutcomes,
    featureUsage,
    aiAssistedFunnel,
    comparison,
    avgDealSizeComparison,
    insights: insights.slice(0, 5),
    lastUpdatedAt: new Date().toISOString(),
  };
}
