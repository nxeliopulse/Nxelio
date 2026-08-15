import type { RevenueAnalyticsData, RevenueFilters, AttributionRow } from "@/lib/queries/analytics-revenue";
import { RevenueFilterBar } from "@/components/analytics/revenue/revenue-filter-bar";
import { ForecastCategories } from "@/components/analytics/revenue/forecast-categories";
import { AttributionTable } from "@/components/analytics/revenue/attribution-table";
import { RevenueTrendChart } from "@/components/analytics/overview/revenue-trend-chart";
import { KpiCard, formatNumber, formatCurrency } from "@/components/analytics/overview/kpi-card";
import { AnalyticsEmptyState } from "@/components/analytics/overview/analytics-empty-state";

function resolveOwnerLabels(rows: AttributionRow[], ownerNames: Record<string, string>): AttributionRow[] {
  return rows.map((r) => ({ ...r, label: ownerNames[r.label] || r.label }));
}

export function RevenueView({ data, filters, ownerNames }: { data: RevenueAnalyticsData; filters: RevenueFilters; ownerNames: Record<string, string> }) {
  const { kpis, attribution } = data;
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

          <RevenueTrendChart points={data.revenueTrend.map((p) => ({ bucketLabel: p.bucketLabel, wonRevenue: p.wonRevenue, weightedForecast: kpis.weightedPipeline }))} />

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
        </>
      )}
    </div>
  );
}
