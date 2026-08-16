"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Download, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProspectsFilters, ProspectsAnalyticsData } from "@/lib/queries/analytics-prospects";
import type { DateRangePreset, ComparisonMode } from "@/lib/analytics/overview-metrics";
import { AI_SCORE_BANDS } from "@/lib/analytics/prospects-metrics";

// Buying Intent has no independent field in this schema — it's the same AI
// score bands used for scoring (see prospects-metrics.ts's buyingIntentFromScore
// doc comment). This dropdown is a labeled convenience over the existing
// aiScoreMin/aiScoreMax filters, not a second underlying signal.
const BUYING_INTENT_OPTIONS = AI_SCORE_BANDS;

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
];
const SELECT_CLASS = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40";

interface ProspectsFilterBarProps {
  filters: ProspectsFilters;
  sources: string[];
  industries: string[];
  companySizes: string[];
  countries: string[];
  statuses: string[];
  segments: { id: string; segment_name: string }[];
  users: { id: string; name: string }[];
  showTeamFilter: boolean;
  data: ProspectsAnalyticsData;
}

export function ProspectsFilterBar({ filters, sources, industries, companySizes, countries, statuses, segments, users, showTeamFilter, data }: ProspectsFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(filters);

  function apply() {
    const params = new URLSearchParams();
    params.set("range", pending.dateRange);
    params.set("compare", pending.comparison);
    if (pending.owner) params.set("owner", pending.owner);
    if (pending.source) params.set("source", pending.source);
    if (pending.industry) params.set("industry", pending.industry);
    if (pending.companySize) params.set("companySize", pending.companySize);
    if (pending.country) params.set("country", pending.country);
    if (pending.status) params.set("status", pending.status);
    if (pending.segmentId) params.set("segment", pending.segmentId);
    if (pending.aiScoreMin != null) params.set("scoreMin", String(pending.aiScoreMin));
    if (pending.aiScoreMax != null) params.set("scoreMax", String(pending.aiScoreMax));
    router.push(`${pathname}?${params.toString()}`);
  }

  function clear() {
    setPending({ dateRange: "last_30_days", comparison: "previous_period" });
    router.push(pathname);
  }

  function saveView() {
    localStorage.setItem("analytics_prospects_saved_view", new URLSearchParams(window.location.search).toString());
  }

  function setBuyingIntent(label: string) {
    const band = BUYING_INTENT_OPTIONS.find((b) => b.label === label);
    setPending({ ...pending, aiScoreMin: band?.min, aiScoreMax: band?.max });
  }

  function exportCsv() {
    const lines = ["Prospect,Company,Title,Source,AI Score,Buying Intent,Engagement,Owner,Status"];
    for (const p of data.topProspects) lines.push(`"${p.name.replace(/"/g, '""')}","${(p.company || "").replace(/"/g, '""')}","${p.title || ""}",${p.source || ""},${p.aiScore},${p.buyingIntent},${p.engagement},,${p.status}`);
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prospects-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-xl border border-slate-100">
      <select className={SELECT_CLASS} value={pending.dateRange} onChange={(e) => setPending({ ...pending, dateRange: e.target.value as DateRangePreset })}>
        {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.comparison} onChange={(e) => setPending({ ...pending, comparison: e.target.value as ComparisonMode })}>
        <option value="previous_period">vs. Previous Period</option>
        <option value="previous_month">vs. Previous Month</option>
        <option value="previous_quarter">vs. Previous Quarter</option>
        <option value="previous_year">vs. Previous Year</option>
        <option value="none">No comparison</option>
      </select>
      <select className={SELECT_CLASS} value={pending.owner ?? ""} onChange={(e) => setPending({ ...pending, owner: e.target.value || undefined })}>
        <option value="">Owner: All</option>
        <option value="me">Owner: Me</option>
        {showTeamFilter && <option value="team">Owner: My Team</option>}
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.source ?? ""} onChange={(e) => setPending({ ...pending, source: e.target.value || undefined })}>
        <option value="">All Sources</option>
        {sources.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.industry ?? ""} onChange={(e) => setPending({ ...pending, industry: e.target.value || undefined })}>
        <option value="">All Industries</option>
        {industries.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.companySize ?? ""} onChange={(e) => setPending({ ...pending, companySize: e.target.value || undefined })}>
        <option value="">All Company Sizes</option>
        {companySizes.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.country ?? ""} onChange={(e) => setPending({ ...pending, country: e.target.value || undefined })}>
        <option value="">All Countries</option>
        {countries.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.status ?? ""} onChange={(e) => setPending({ ...pending, status: e.target.value || undefined })}>
        <option value="">All Statuses</option>
        {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.segmentId ?? ""} onChange={(e) => setPending({ ...pending, segmentId: e.target.value || undefined })}>
        <option value="">All Segments</option>
        {segments.map((s) => <option key={s.id} value={s.id}>{s.segment_name}</option>)}
      </select>
      <select
        className={SELECT_CLASS}
        value={BUYING_INTENT_OPTIONS.find((b) => b.min === pending.aiScoreMin && b.max === pending.aiScoreMax)?.label ?? ""}
        onChange={(e) => setBuyingIntent(e.target.value)}
      >
        <option value="">All Buying Intent</option>
        {BUYING_INTENT_OPTIONS.map((b) => <option key={b.label} value={b.label}>{b.label} Intent</option>)}
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
