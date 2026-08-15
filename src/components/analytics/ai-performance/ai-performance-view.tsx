import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { AiPerformanceData } from "@/lib/queries/analytics-ai-performance";
import { ScoreBandOutcomesTable } from "@/components/analytics/ai-performance/score-band-outcomes-table";
import { ComparisonChart } from "@/components/analytics/ai-performance/comparison-chart";
import { FeatureUsageTable } from "@/components/analytics/ai-performance/feature-usage-table";
import { RevenueFunnel } from "@/components/analytics/overview/revenue-funnel";
import { KpiCard, formatNumber, formatCurrency } from "@/components/analytics/overview/kpi-card";
import { AnalyticsEmptyState } from "@/components/analytics/overview/analytics-empty-state";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export function AiPerformanceView({ data }: { data: AiPerformanceData }) {
  const { kpis } = data;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900">AI Performance Analytics</h1>
        <p className="text-sm text-slate-500 mt-0.5">Whether AI scoring, content and recommendations actually move engagement, pipeline and revenue.</p>
        <p className="text-xs text-slate-400 mt-1">
          No dedicated AI-event log exists yet in this schema — this page derives everything from real lead scores, credit usage, and downstream outcomes. A structured ai_events table (doc §54) would sharpen this further, particularly enrichment/content/recommendation tracking.
        </p>
      </div>

      {!data.hasAnyData ? (
        <AnalyticsEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="AI Credits Used" value={formatNumber(kpis.aiCreditsUsed)} href="/billing" />
            <KpiCard label="AI-Assisted Prospects" value={formatNumber(kpis.aiAssistedProspects)} href="/leads" />
            <KpiCard label="AI-Assisted Meetings" value={formatNumber(kpis.aiAssistedMeetings)} href="/meetings" />
            <KpiCard label="AI-Influenced Pipeline" value={formatCurrency(kpis.aiInfluencedPipeline)} href="/opportunities" />
            <KpiCard label="AI-Influenced Revenue" value={formatCurrency(kpis.aiInfluencedRevenue)} href="/opportunities" />
          </div>

          <ScoreBandOutcomesTable rows={data.scoreBandOutcomes} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ComparisonChart rows={data.comparison} />
            <FeatureUsageTable rows={data.featureUsage} />
          </div>

          <RevenueFunnel stages={data.aiAssistedFunnel} title="AI-Assisted Funnel" />

          {data.insights.length > 0 && (
            <Card className="p-5">
              <CardHeader className="p-0 border-0 mb-3">
                <CardTitle className="text-sm flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-indigo-500" /> AI Performance Insights</CardTitle>
              </CardHeader>
              <div className="space-y-2">
                {data.insights.map((insight) => (
                  <div key={insight.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
                    <p className="text-sm font-medium text-slate-700">{insight.title}</p>
                    <Link href={insight.ctaHref} className="text-xs font-bold text-indigo-600 hover:underline flex-shrink-0">{insight.ctaLabel}</Link>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
