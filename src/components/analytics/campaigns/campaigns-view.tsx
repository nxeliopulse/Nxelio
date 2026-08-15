import type { CampaignsAnalyticsData, CampaignsFilters } from "@/lib/queries/analytics-campaigns";
import { CampaignsFilterBar } from "@/components/analytics/campaigns/campaigns-filter-bar";
import { CampaignPerformanceTable } from "@/components/analytics/campaigns/campaign-performance-table";
import { StepAnalyticsTable } from "@/components/analytics/campaigns/step-analytics-table";
import { KpiCard, formatNumber, formatCurrency } from "@/components/analytics/overview/kpi-card";
import { AnalyticsEmptyState } from "@/components/analytics/overview/analytics-empty-state";

export function CampaignsView({
  data,
  filters,
  campaigns,
}: {
  data: CampaignsAnalyticsData;
  filters: CampaignsFilters;
  campaigns: { id: string; campaign_name: string }[];
}) {
  const { kpis } = data;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900">Campaigns & Sequences Analytics</h1>
        <p className="text-sm text-slate-500 mt-0.5">Which campaigns and sequences are performing, and where prospects are dropping off.</p>
      </div>

      <CampaignsFilterBar filters={filters} campaigns={campaigns} data={data} />

      {!data.hasAnyData ? (
        <AnalyticsEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Total Campaigns" value={formatNumber(kpis.totalCampaigns)} href="/campaigns" />
            <KpiCard label="Active" value={formatNumber(kpis.active)} href="/campaigns" />
            <KpiCard label="Paused" value={formatNumber(kpis.paused)} href="/campaigns" />
            <KpiCard label="Completed" value={formatNumber(kpis.completed)} href="/campaigns" />
            <KpiCard label="Prospects Enrolled" value={formatNumber(kpis.prospectsEnrolled)} href="/leads" />
            <KpiCard label="Average Reply Rate" value={`${kpis.averageReplyRate}%`} />
            <KpiCard label="Average Meeting Rate" value={`${kpis.averageMeetingRate}%`} />
            <KpiCard label="Qualification Rate" value={`${kpis.qualificationRate}%`} />
            <KpiCard label="Pipeline Generated" value={formatCurrency(kpis.pipelineGenerated)} href="/opportunities" />
            <KpiCard label="Revenue Generated" value={formatCurrency(kpis.revenueGenerated)} href="/opportunities" />
          </div>

          <CampaignPerformanceTable rows={data.performance} />
          <StepAnalyticsTable rows={data.stepAnalytics} />
        </>
      )}
    </div>
  );
}
