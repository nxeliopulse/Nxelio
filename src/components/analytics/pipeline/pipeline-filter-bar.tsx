"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Download, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PipelineFilters, PipelineAnalyticsData } from "@/lib/queries/analytics-pipeline";
import type { DateRangePreset } from "@/lib/analytics/overview-metrics";
import { OPPORTUNITY_STAGES, STAGE_LABELS, CLOSED_STAGES } from "@/lib/opportunities";

const SELECT_CLASS = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40";
const RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_90_days", label: "Last 90 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_year", label: "This Year" },
];

export function PipelineFilterBar({ filters, showTeamFilter, sources, data }: { filters: PipelineFilters; showTeamFilter: boolean; sources: string[]; data: PipelineAnalyticsData }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(filters);
  const openStages = OPPORTUNITY_STAGES.filter((s) => !CLOSED_STAGES.includes(s));

  function apply() {
    const params = new URLSearchParams();
    params.set("range", pending.dateRange);
    if (pending.stage) params.set("stage", pending.stage);
    if (pending.owner) params.set("owner", pending.owner);
    if (pending.source) params.set("source", pending.source);
    router.push(`${pathname}?${params.toString()}`);
  }

  function clear() {
    setPending({ dateRange: "last_30_days" });
    router.push(pathname);
  }

  function exportCsv() {
    const lines = ["Stage,Deals,Total Amount,Average Amount,Weighted Value,% of Pipeline"];
    for (const r of data.byStage) lines.push(`${r.label},${r.count},${r.totalAmount},${r.averageAmount},${r.weightedValue},${r.percentOfPipeline}%`);
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pipeline-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-xl border border-slate-100">
      <select className={SELECT_CLASS} value={pending.dateRange} onChange={(e) => setPending({ ...pending, dateRange: e.target.value as DateRangePreset })}>
        {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.stage ?? ""} onChange={(e) => setPending({ ...pending, stage: (e.target.value || undefined) as PipelineFilters["stage"] })}>
        <option value="">All Stages</option>
        {openStages.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.owner ?? ""} onChange={(e) => setPending({ ...pending, owner: e.target.value || undefined })}>
        <option value="">Owner: Default</option>
        <option value="me">Owner: Me</option>
        {showTeamFilter && <option value="team">Owner: My Team</option>}
        <option value="all">Owner: All (Workspace)</option>
      </select>
      <select className={SELECT_CLASS} value={pending.source ?? ""} onChange={(e) => setPending({ ...pending, source: e.target.value || undefined })}>
        <option value="">All Sources</option>
        {sources.map((s) => <option key={s} value={s}>{s}</option>)}
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
