"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Download, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CampaignsFilters, CampaignsAnalyticsData } from "@/lib/queries/analytics-campaigns";
import type { DateRangePreset } from "@/lib/analytics/overview-metrics";

const SELECT_CLASS = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40";
const STATUSES = ["Active", "Paused", "Completed", "Draft"];
const RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_90_days", label: "Last 90 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_year", label: "This Year" },
];

export function CampaignsFilterBar({
  filters,
  campaigns,
  segments,
  data,
}: {
  filters: CampaignsFilters;
  campaigns: { id: string; campaign_name: string }[];
  segments: { id: string; segment_name: string }[];
  data: CampaignsAnalyticsData;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(filters);

  function apply() {
    const params = new URLSearchParams();
    params.set("range", pending.dateRange);
    if (pending.status) params.set("status", pending.status);
    if (pending.segmentId) params.set("segment", pending.segmentId);
    if (pending.campaignId) params.set("campaign", pending.campaignId);
    router.push(`${pathname}?${params.toString()}`);
  }

  function clear() {
    setPending({ dateRange: "last_30_days" });
    router.push(pathname);
  }

  function exportCsv() {
    const lines = ["Campaign,Segment,Enrolled,Sent,Delivered,Delivery Rate,Open Rate,Click Rate,Reply Rate,Meetings,Qualified,Opportunities,Pipeline,Revenue,Status"];
    for (const c of data.performance) {
      lines.push(`"${c.name.replace(/"/g, '""')}",${c.segment || ""},${c.enrolled},${c.sent},${c.delivered},${c.deliveryRate}%,${c.openRate}%,${c.clickRate}%,${c.replyRate}%,${c.meetings},${c.qualified},${c.opportunities},${c.pipeline},${c.revenue},${c.status}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaigns-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-xl border border-slate-100">
      <select className={SELECT_CLASS} value={pending.dateRange} onChange={(e) => setPending({ ...pending, dateRange: e.target.value as DateRangePreset })}>
        {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.status ?? ""} onChange={(e) => setPending({ ...pending, status: e.target.value || undefined })}>
        <option value="">All Statuses</option>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.segmentId ?? ""} onChange={(e) => setPending({ ...pending, segmentId: e.target.value || undefined })}>
        <option value="">All Segments</option>
        {segments.map((s) => <option key={s.id} value={s.id}>{s.segment_name}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.campaignId ?? ""} onChange={(e) => setPending({ ...pending, campaignId: e.target.value || undefined })} title="Scope step analytics to one campaign">
        <option value="">Step Analytics: All Campaigns</option>
        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.campaign_name}</option>)}
      </select>
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[11px] text-slate-400 mr-1 hidden lg:inline">
          Updated {new Date(data.lastUpdatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <Button size="sm" variant="ghost" onClick={() => router.refresh()} title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></Button>
        <Button size="sm" onClick={apply}>Apply</Button>
        <Button size="sm" variant="outline" onClick={clear}><X className="h-3.5 w-3.5" /> Clear</Button>
        <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export</Button>
      </div>
    </div>
  );
}
