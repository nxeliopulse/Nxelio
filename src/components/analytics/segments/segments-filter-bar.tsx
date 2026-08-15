"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
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

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-xl border border-slate-100">
      <select className={SELECT_CLASS} value={pending.dateRange} onChange={(e) => setPending({ ...pending, dateRange: e.target.value as DateRangePreset })}>
        {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[11px] text-slate-400 mr-1 hidden lg:inline">
          Updated {new Date(data.lastUpdatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <Button size="sm" variant="ghost" onClick={() => router.refresh()} title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></Button>
        <Button size="sm" onClick={() => router.push(`${pathname}?range=${pending.dateRange}`)}>Apply</Button>
      </div>
    </div>
  );
}
