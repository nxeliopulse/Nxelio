import type { RevenueAnalyticsData, RevenueFilters, AttributionRow } from "@/lib/queries/analytics-revenue";
import { AiInsightsPanel } from "@/components/analytics/ai-insights-panel";
import { RevenueFilterBar } from "@/components/analytics/revenue/revenue-filter-bar";
import { ForecastCategories } from "@/components/analytics/revenue/forecast-categories";
import { AttributionTable } from "@/components/analytics/revenue/attribution-table";
import { RevenueTrendChart } from "@/components/analytics/overview/revenue-trend-chart";
import { PipelineTrendChart } from "@/components/analytics/revenue/pipeline-trend-chart";
import { KpiCard, formatNumber, formatCurrency } from "@/components/analytics/overview/kpi-card";
import { AnalyticsEmptyState } from "@/components/analytics/overview/analytics-empty-state";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

function resolveOwnerLabels(rows: AttributionRow[], ownerNames: Record<string, string>): AttributionRow[] {
  return rows.map((r) => ({ ...r, label: ownerNames[r.label] || r.label }));
}

export function RevenueView({ data, filters, ownerNames }: { data: RevenueAnalyticsData; filters: RevenueFilters; ownerNames: Record<string, string> }) {
  const { kpis, attribution, quota, forecastAccuracy, slippage } = data;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900">Revenue & Forecast Analytics</h1>
        <p className="text-sm text-slate-500 mt-0.5">How much revenue is won, and which sources, segments, campaigns and reps are driving it.</p>
      </div>

      <RevenueFilterBar filters={filters} data={data} />

      {!data.hasAnyData ? (
        <AnalyticsEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Won Revenue" value={formatCurrency(kpis.wonRevenue)} href="/opportunities" />
            <KpiCard label="Won Deal Count" value={formatNumber(kpis.wonDealCount)} href="/opportunities" />
            <KpiCard label="Average Won Deal" value={formatCurrency(kpis.averageWonDeal)} />
            <KpiCard label="Weighted Pipeline" value={formatCurrency(kpis.weightedPipeline)} />
          </div>

          {quota ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard
                label="Pipeline Coverage"
                value={`${quota.pipelineCoverageRatio}x`}
                detail={`Target $${quota.targetAmount.toLocaleString()} (${quota.periodStart} – ${quota.periodEnd})`}
              />
              <KpiCard
                label="Quota Attainment"
                value={`${quota.attainmentPercent}%`}
                detail={`${formatCurrency(kpis.wonRevenue)} of ${formatCurrency(quota.targetAmount)}`}
              />
              <KpiCard
                label="Gap to Target"
                value={formatCurrency(quota.gapToTarget)}
                detail={quota.gapToTarget === 0 ? "Target met" : "Still needed to hit quota"}
              />
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">
              Set a team revenue quota under Administration → Sales Quotas to unlock Pipeline Coverage, Quota Attainment, and Gap to Target.
            </p>
          )}

          <RevenueTrendChart points={data.revenueTrend.map((p) => ({ bucketLabel: p.bucketLabel, wonRevenue: p.wonRevenue, weightedForecast: kpis.weightedPipeline }))} />

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            <PipelineTrendChart points={data.pipelineTrend} />
            <Card className="p-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Forecast Accuracy</p>
                {forecastAccuracy ? (
                  <>
                    <p className="text-2xl font-black text-slate-900">{forecastAccuracy.accuracyPercent}%</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Predicted {formatCurrency(forecastAccuracy.predictedAtRangeStart)} as of {forecastAccuracy.asOfDate}, actual {formatCurrency(forecastAccuracy.actualWonRevenue)}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 italic">No snapshot yet at the start of this range — accuracy appears once the daily cron has history to compare against.</p>
                )}
              </div>
              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-1">Slippage</p>
                <p className="text-2xl font-black text-slate-900">{slippage.dealCount}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {slippage.dealCount === 0 ? "No open deals past their expected close date." : `${formatCurrency(slippage.totalValue)} in deals past their expected close date`}
                </p>
              </div>
            </Card>
          </div>

          <ForecastCategories rows={data.forecastCategories} />

          <div>
            <h2 className="text-sm font-bold text-slate-900 mb-2">Revenue Attribution</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AttributionTable title="Revenue by Source" rows={attribution.bySource} />
              <AttributionTable title="Revenue by Segment" rows={attribution.bySegment} />
              <AttributionTable title="Revenue by Campaign" rows={attribution.byCampaign} />
              <AttributionTable title="Revenue by Industry" rows={attribution.byIndustry} />
              <AttributionTable title="Revenue by Owner" rows={resolveOwnerLabels(attribution.byOwner, ownerNames)} />
              <AttributionTable title="Revenue by Account" rows={attribution.byAccount} />
            </div>
          </div>

          <AiInsightsPanel area="revenue" insights={data.aiInsights} heading="AI Revenue Insights" />
        </>
      )}
    </div>
  );
}
