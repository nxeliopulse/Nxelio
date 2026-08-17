"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChartWidget } from "@/components/analytics/widgets/AreaChartWidget";
import type { RevenueTrendPoint } from "@/lib/queries/analytics-overview";

const GRANULARITY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

/** Revenue Trend (doc §9) — Closed-Won as the primary area, Weighted
 *  Forecast as the dashed overlay (AreaChartWidget's `value2` convention).
 *  Granularity is server-computed (the underlying buckets differ), so the
 *  selector pushes a `gran` query param and lets the page re-fetch — same
 *  pattern as every other filter on this page. */
export function RevenueTrendChart({ points, granularity = "weekly" }: { points: RevenueTrendPoint[]; granularity?: "daily" | "weekly" | "monthly" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const data = points.map((p) => ({ label: p.bucketLabel, value: Math.round(p.wonRevenue), value2: Math.round(p.weightedForecast) }));

  function setGranularity(g: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("gran", g);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-0 border-0 flex-row items-center justify-between">
        <CardTitle className="text-sm">Revenue Trend</CardTitle>
        <select
          className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          value={granularity}
          onChange={(e) => setGranularity(e.target.value)}
        >
          {GRANULARITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </CardHeader>
      <AreaChartWidget config={{ chartType: "area", title: "Closed-Won Revenue", unit: "currency" }} data={data} />
    </Card>
  );
}
