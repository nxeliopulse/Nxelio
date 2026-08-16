import type { ProspectsAnalyticsData, ProspectsFilters } from "@/lib/queries/analytics-prospects";
import { AiInsightsPanel } from "@/components/analytics/ai-insights-panel";
import { ProspectsFilterBar } from "@/components/analytics/prospects/prospects-filter-bar";
import { ProspectGrowthChart } from "@/components/analytics/prospects/prospect-growth-chart";
import { ScoreDistributionTable } from "@/components/analytics/prospects/score-distribution-table";
import { TopProspectsTable } from "@/components/analytics/prospects/top-prospects-table";
import { KpiCard, formatNumber } from "@/components/analytics/overview/kpi-card";
import { AnalyticsEmptyState } from "@/components/analytics/overview/analytics-empty-state";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChartWidget } from "@/components/analytics/widgets/DonutChartWidget";
import { BarChartWidget } from "@/components/analytics/widgets/BarChartWidget";

interface ProspectsViewProps {
  data: ProspectsAnalyticsData;
  filters: ProspectsFilters;
  sources: string[];
  industries: string[];
  companySizes: string[];
  countries: string[];
  statuses: string[];
  segments: { id: string; segment_name: string }[];
  users: { id: string; name: string }[];
  ownerNames: Record<string, string>;
}

export function ProspectsView({ data, filters, sources, industries, companySizes, countries, statuses, segments, users, ownerNames }: ProspectsViewProps) {
  const { kpis } = data;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900">Prospect Analytics</h1>
        <p className="text-sm text-slate-500 mt-0.5">Where are your prospects coming from, how good are they, and which ones should the team focus on?</p>
      </div>

      <ProspectsFilterBar
        filters={filters}
        sources={sources}
        industries={industries}
        companySizes={companySizes}
        countries={countries}
        statuses={statuses}
        segments={segments}
        users={users}
        showTeamFilter={data.showTeamFilter}
        data={data}
      />

      {!data.hasAnyData ? (
        <AnalyticsEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <KpiCard label="Total Prospects" value={formatNumber(kpis.totalProspects.value)} href="/leads" />
            <KpiCard label="New Prospects" value={formatNumber(kpis.newProspects.value)} changePercent={kpis.newProspects.changePercent} href="/leads" />
            <KpiCard label="Enriched Prospects" value={formatNumber(kpis.enrichedProspects.value)} href="/leads" />
            <KpiCard label="AI Scored Prospects" value={formatNumber(kpis.aiScoredProspects.value)} href="/leads" />
            <KpiCard label="Avg AI Score" value={String(kpis.averageAiScore.value)} href="/leads" />
            <KpiCard label="High Priority" value={formatNumber(kpis.highPriorityProspects.count)} detail={kpis.highPriorityProspects.thresholdText} href="/leads" />
            <KpiCard label="Qualified Prospects" value={formatNumber(kpis.qualifiedProspects.value)} changePercent={kpis.qualifiedProspects.changePercent} href="/leads" />
          </div>

          <ProspectGrowthChart points={data.growth} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Prospects by Source</CardTitle></CardHeader>
              <DonutChartWidget config={{ chartType: "donut", title: "Prospects by Source" }} data={data.bySource.map((s) => ({ label: `${s.label} (${s.percent}%)`, value: s.count }))} />
            </Card>
            <Card>
              <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Prospects by Industry</CardTitle></CardHeader>
              <BarChartWidget config={{ chartType: "bar", title: "Prospects by Industry" }} data={data.byIndustry.map((s) => ({ label: `${s.label} (${s.percent}%)`, value: s.count }))} />
            </Card>
            <Card>
              <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Prospects by Geography</CardTitle></CardHeader>
              <BarChartWidget config={{ chartType: "bar", title: "Prospects by Geography" }} data={data.byCountry.slice(0, 10).map((s) => ({ label: `${s.label} (${s.percent}%)`, value: s.count }))} />
            </Card>
          </div>

          <ScoreDistributionTable bands={data.scoreDistribution} />

          <Card>
            <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Prospects by Company Size</CardTitle></CardHeader>
            <BarChartWidget config={{ chartType: "bar", title: "Prospects by Company Size" }} data={data.byCompanySize.map((s) => ({ label: s.label, value: s.count }))} />
          </Card>

          <AiInsightsPanel area="prospects" insights={data.aiInsights} heading="AI Prospect Insights" />

          <TopProspectsTable prospects={data.topProspects} ownerNames={ownerNames} />
        </>
      )}
    </div>
  );
}
