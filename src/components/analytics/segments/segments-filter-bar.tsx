"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Download, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SegmentsFilters, SegmentsAnalyticsData } from "@/lib/queries/analytics-segments";
import type { DateRangePreset } from "@/lib/analytics/overview-metrics";

const RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_90_days", label: "Last 90 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_year", label: "This Year" },
];
const SELECT_CLASS = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40";

export function SegmentsFilterBar({ filters, data }: { filters: SegmentsFilters; data: SegmentsAnalyticsData }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(filters);

  function apply() {
    const params = new URLSearchParams();
    params.set("range", pending.dateRange);
    if (pending.segmentType) params.set("type", pending.segmentType);
    if (pending.status) params.set("status", pending.status);
    router.push(`${pathname}?${params.toString()}`);
  }

  function clear() {
    setPending({ dateRange: "last_30_days" });
    router.push(pathname);
  }

  function saveView() {
    localStorage.setItem("analytics_segments_saved_view", new URLSearchParams(window.location.search).toString());
  }

  function exportCsv() {
    const lines = ["Segment,Type,Status,Matching,Eligible,Campaigns,Reply Rate,Meeting Rate,Qualification Rate,Opportunities,Pipeline,Revenue"];
    for (const r of data.performance) {
      lines.push(`"${r.name.replace(/"/g, '""')}",${r.type},${r.status},${r.matchingProspects},${r.eligibleProspects},${r.campaigns},${r.replyRate}%,${r.meetingRate}%,${r.qualificationRate}%,${r.opportunities},${r.pipeline},${r.revenue}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `segments-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-xl border border-slate-100">
      <select className={SELECT_CLASS} value={pending.dateRange} onChange={(e) => setPending({ ...pending, dateRange: e.target.value as DateRangePreset })}>
        {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.segmentType ?? ""} onChange={(e) => setPending({ ...pending, segmentType: e.target.value || undefined })}>
        <option value="">All Types</option>
        <option value="Dynamic">Dynamic</option>
        <option value="Static">Static</option>
      </select>
      <select className={SELECT_CLASS} value={pending.status ?? ""} onChange={(e) => setPending({ ...pending, status: e.target.value || undefined })}>
        <option value="">All Statuses</option>
        <option value="Active">Active</option>
        <option value="Archived">Archived</option>
      </select>
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[11px] text-slate-400 mr-1 hidden lg:inline">
          Updated {new Date(data.lastUpdatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <Button size="sm" variant="ghost" onClick={() => router.refresh()} title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></Button>
        <Button size="sm" onClick={apply}>Apply</Button>
        <Button size="sm" variant="outline" onClick={clear}><X className="h-3.5 w-3.5" /> Clear</Button>
        <Button size="sm" variant="outline" onClick={saveView}>Save View</Button>
        <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export</Button>
      </div>
    </div>
  );
}
