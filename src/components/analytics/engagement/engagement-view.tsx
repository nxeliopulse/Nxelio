import { AlertTriangle } from "lucide-react";
import type { EngagementAnalyticsData, EngagementFilters } from "@/lib/queries/analytics-engagement";
import { EngagementFilterBar } from "@/components/analytics/engagement/engagement-filter-bar";
import { EngagementTrendChart } from "@/components/analytics/engagement/engagement-trend-chart";
import { ChannelPerformanceTable } from "@/components/analytics/engagement/channel-performance-table";
import { SubjectPerformanceTable } from "@/components/analytics/engagement/subject-performance-table";
import { SendTimeHeatmap } from "@/components/analytics/engagement/send-time-heatmap";
import { ReplyClassificationPanel } from "@/components/analytics/engagement/reply-classification-panel";
import { RevenueFunnel } from "@/components/analytics/overview/revenue-funnel";
import { KpiCard, formatNumber } from "@/components/analytics/overview/kpi-card";
import { AnalyticsEmptyState } from "@/components/analytics/overview/analytics-empty-state";
import { Card } from "@/components/ui/card";

export function EngagementView({
  data,
  filters,
  campaigns,
}: {
  data: EngagementAnalyticsData;
  filters: EngagementFilters;
  campaigns: { id: string; campaign_name: string }[];
}) {
  const { kpis, rates } = data;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900">Email & Engagement Analytics</h1>
        <p className="text-sm text-slate-500 mt-0.5">How effective is your outreach, and which engagement converts into meetings, pipeline, and revenue?</p>
      </div>

      <EngagementFilterBar filters={filters} campaigns={campaigns} data={data} />

      {!data.hasAnyData ? (
        <AnalyticsEmptyState />
      ) : (
        <>
          {data.bounceWarning && (
            <Card className="p-3 flex items-center gap-2 bg-rose-50 border-rose-100">
              <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
              <p className="text-sm font-medium text-rose-700 flex-1">{data.bounceWarning}</p>
            </Card>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Emails Sent" value={formatNumber(kpis.sent)} href="/activities/emails" />
            <KpiCard label="Delivered" value={formatNumber(kpis.delivered)} detail={`${rates.deliveryRate}% delivery rate`} />
            <KpiCard label="Opened" value={formatNumber(kpis.opened)} detail={`${rates.openRate}% open rate`} />
            <KpiCard label="Clicked" value={formatNumber(kpis.clicked)} detail={`${rates.clickRate}% click rate`} />
            <KpiCard label="Replies" value={formatNumber(kpis.replies)} detail={`${rates.replyRate}% reply rate`} href="/inbox" />
            <KpiCard label="Positive Replies" value={formatNumber(kpis.positiveReplies)} detail={`${rates.positiveReplyRate}% positive reply rate`} href="/inbox" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Bounce Rate" value={`${rates.bounceRate}%`} />
            <KpiCard label="Unsubscribe Rate" value={`${rates.unsubscribeRate}%`} />
            <KpiCard label="Delivery Rate" value={`${rates.deliveryRate}%`} />
            <KpiCard label="Reply Rate" value={`${rates.replyRate}%`} />
          </div>

          <EngagementTrendChart points={data.trend} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChannelPerformanceTable rows={data.byChannel} />
            <ReplyClassificationPanel rows={data.replyClassification} />
          </div>

          <SendTimeHeatmap cells={data.heatmap} />
          <SubjectPerformanceTable rows={data.subjectPerformance} />

          <RevenueFunnel
            stages={data.funnel}
            title="Engagement Funnel"
            stageHref={{ sent: "/activities/emails", delivered: "/activities/emails", opened: "/activities/emails", clicked: "/activities/emails", replied: "/inbox", positive_reply: "/inbox", meeting: "/meetings" }}
          />
        </>
      )}
    </div>
  );
}
