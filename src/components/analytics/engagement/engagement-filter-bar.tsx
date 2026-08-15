"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EngagementFilters, EngagementAnalyticsData } from "@/lib/queries/analytics-engagement";
import type { DateRangePreset } from "@/lib/analytics/overview-metrics";

const RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_90_days", label: "Last 90 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
];
const SELECT_CLASS = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40";

export function EngagementFilterBar({ filters, campaigns, data }: { filters: EngagementFilters; campaigns: { id: string; campaign_name: string }[]; data: EngagementAnalyticsData }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(filters);

  function apply() {
    const params = new URLSearchParams();
    params.set("range", pending.dateRange);
    if (pending.campaignId) params.set("campaign", pending.campaignId);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-xl border border-slate-100">
      <select className={SELECT_CLASS} value={pending.dateRange} onChange={(e) => setPending({ ...pending, dateRange: e.target.value as DateRangePreset })}>
        {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select className={SELECT_CLASS} value={pending.campaignId ?? ""} onChange={(e) => setPending({ ...pending, campaignId: e.target.value || undefined })}>
        <option value="">All Campaigns</option>
        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.campaign_name}</option>)}
      </select>
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[11px] text-slate-400 mr-1 hidden lg:inline">
          Updated {new Date(data.lastUpdatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <Button size="sm" variant="ghost" onClick={() => router.refresh()} title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></Button>
        <Button size="sm" onClick={apply}>Apply</Button>
      </div>
    </div>
  );
}
