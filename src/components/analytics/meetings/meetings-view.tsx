import type { MeetingsAnalyticsData, MeetingsFilters } from "@/lib/queries/analytics-meetings";
import { MeetingsFilterBar } from "@/components/analytics/meetings/meetings-filter-bar";
import { QualificationBreakdown } from "@/components/analytics/meetings/qualification-breakdown";
import { RevenueFunnel } from "@/components/analytics/overview/revenue-funnel";
import { KpiCard, formatNumber } from "@/components/analytics/overview/kpi-card";
import { AnalyticsEmptyState } from "@/components/analytics/overview/analytics-empty-state";

export function MeetingsView({ data, filters, ownerNames }: { data: MeetingsAnalyticsData; filters: MeetingsFilters; ownerNames: Record<string, string> }) {
  const { kpis, qualification } = data;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900">Meetings & Qualification Analytics</h1>
        <p className="text-sm text-slate-500 mt-0.5">Which meetings produce qualified opportunities, and how fast prospects qualify.</p>
      </div>

      <MeetingsFilterBar filters={filters} data={data} />

      {!data.hasAnyData ? (
        <AnalyticsEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Meetings Booked" value={formatNumber(kpis.meetingsBooked)} href="/meetings" />
            <KpiCard label="Completed" value={formatNumber(kpis.completed)} href="/meetings" />
            <KpiCard label="Cancelled" value={formatNumber(kpis.cancelled)} href="/meetings" />
            <KpiCard label="Qualified Meetings" value={formatNumber(kpis.qualifiedMeetings)} href="/leads" />
            <KpiCard label="Opportunity-Generating" value={formatNumber(kpis.opportunityGeneratingMeetings)} href="/opportunities" />
          </div>

          <RevenueFunnel
            stages={data.funnel}
            title="Meeting Funnel"
            stageHref={{ replies: "/inbox", meeting_booked: "/meetings", meeting_completed: "/meetings", qualified: "/leads", opportunity: "/opportunities" }}
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Qualified" value={formatNumber(qualification.qualifiedCount)} href="/leads" />
            <KpiCard label="Qualification Rate" value={`${qualification.qualificationRate}%`} />
            <KpiCard label="Avg. Time to Qualify" value={qualification.averageDaysToQualify != null ? `${qualification.averageDaysToQualify}d` : "—"} />
          </div>

          <QualificationBreakdown bySource={qualification.bySource} byOwner={qualification.byOwner} byIndustry={qualification.byIndustry} ownerNames={ownerNames} />
        </>
      )}
    </div>
  );
}
