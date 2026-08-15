"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Download, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OverviewFilters } from "@/lib/queries/analytics-overview";
import type { DateRangePreset, ComparisonMode } from "@/lib/analytics/overview-metrics";
import type { OverviewData } from "@/lib/queries/analytics-overview";

const RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_90_days", label: "Last 90 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "last_quarter", label: "Last Quarter" },
  { value: "this_year", label: "This Year" },
  { value: "custom", label: "Custom Range" },
];
const COMPARE_OPTIONS: { value: ComparisonMode; label: string }[] = [
  { value: "previous_period", label: "Previous Period" },
  { value: "previous_month", label: "Previous Month" },
  { value: "previous_quarter", label: "Previous Quarter" },
  { value: "previous_year", label: "Previous Year" },
  { value: "none", label: "None" },
];

const SELECT_CLASS = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40";

interface GlobalFilterBarProps {
  filters: OverviewFilters;
  campaigns: { id: string; campaign_name: string }[];
  segments: { id: string; segment_name: string }[];
  industries: string[];
  sources: string[];
  users: { id: string; name: string }[];
  showTeamFilter: boolean;
  data: OverviewData;
}

export function GlobalFilterBar({ filters, campaigns, segments, industries, sources, users, showTeamFilter, data }: GlobalFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(filters);
  const [customFrom, setCustomFrom] = useState(filters.customFrom ?? "");
  const [customTo, setCustomTo] = useState(filters.customTo ?? "");

  function apply(next: OverviewFilters = pending) {
    const params = new URLSearchParams();
    params.set("range", next.dateRange);
    if (next.dateRange === "custom") {
      if (customFrom) params.set("from", customFrom);
      if (customTo) params.set("to", customTo);
    }
    params.set("compare", next.comparison);
    if (next.owner) params.set("owner", next.owner);
    if (next.campaignId) params.set("campaign", next.campaignId);
    if (next.segmentId) params.set("segment", next.segmentId);
    if (next.industry) params.set("industry", next.industry);
    if (next.source) params.set("source", next.source);
    if (next.stage) params.set("stage", next.stage);
    router.push(`${pathname}?${params.toString()}`);
  }

  function clear() {
    const cleared: OverviewFilters = { dateRange: "last_30_days", comparison: "previous_period" };
    setPending(cleared);
    setCustomFrom("");
    setCustomTo("");
    router.push(pathname);
  }

  function saveView() {
    const params = new URLSearchParams(window.location.search);
    localStorage.setItem("analytics_overview_saved_view", params.toString());
  }

  function exportCsv() {
    const lines: string[] = ["Metric,Value"];
    lines.push(`Total Prospects,${data.kpis.totalProspects.value}`);
    lines.push(`Replies Received,${data.kpis.replies.value}`);
    lines.push(`Meetings Booked,${data.kpis.meetings.value}`);
    lines.push(`Qualified Prospects,${data.kpis.qualified.value}`);
    lines.push(`Open Pipeline,${data.kpis.openPipeline.value}`);
    lines.push(`Closed-Won Revenue,${data.kpis.closedWonRevenue.value}`);
    lines.push(`Win Rate,${data.kpis.winRate.value}%`);
    lines.push(`Weighted Forecast,${data.kpis.weightedForecast.value}`);
    lines.push("");
    lines.push("Campaign,Replies,Meetings,Qualified,Opportunities,Pipeline,Revenue");
    for (const c of data.topCampaigns) lines.push(`"${c.name.replace(/"/g, '""')}",${c.replies},${c.meetings},${c.qualified},${c.opportunities},${c.pipeline},${c.revenue}`);
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-overview-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-xl border border-slate-100">
      <select className={SELECT_CLASS} value={pending.dateRange} onChange={(e) => setPending({ ...pending, dateRange: e.target.value as DateRangePreset })}>
        {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {pending.dateRange === "custom" && (
        <>
          <input type="date" className={SELECT_CLASS} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <input type="date" className={SELECT_CLASS} value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </>
      )}
      <select className={SELECT_CLASS} value={pending.comparison} onChange={(e) => setPending({ ...pending, comparison: e.target.value as ComparisonMode })} title="Compare With">
        {COMPARE_OPTIONS.map((o) => <option key={o.value} value={o.value}>vs. {o.label}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.owner ?? ""} onChange={(e) => setPending({ ...pending, owner: e.target.value || undefined })}>
        <option value="">Owner: All</option>
        <option value="me">Owner: Me</option>
        {showTeamFilter && <option value="team">Owner: My Team</option>}
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.campaignId ?? ""} onChange={(e) => setPending({ ...pending, campaignId: e.target.value || undefined })}>
        <option value="">All Campaigns</option>
        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.campaign_name}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.segmentId ?? ""} onChange={(e) => setPending({ ...pending, segmentId: e.target.value || undefined })}>
        <option value="">All Segments</option>
        {segments.map((s) => <option key={s.id} value={s.id}>{s.segment_name}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.industry ?? ""} onChange={(e) => setPending({ ...pending, industry: e.target.value || undefined })}>
        <option value="">All Industries</option>
        {industries.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.source ?? ""} onChange={(e) => setPending({ ...pending, source: e.target.value || undefined })}>
        <option value="">All Sources</option>
        {sources.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[11px] text-slate-400 mr-1 hidden lg:inline">
          Last updated: {new Date(data.lastUpdatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <Button size="sm" variant="ghost" onClick={() => router.refresh()} title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></Button>
        <Button size="sm" onClick={() => apply()}>Apply</Button>
        <Button size="sm" variant="outline" onClick={clear}><X className="h-3.5 w-3.5" /> Clear</Button>
        <Button size="sm" variant="outline" onClick={saveView}>Save View</Button>
        <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export</Button>
      </div>
    </div>
  );
}
