"use client";
import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChartWidget } from "@/components/analytics/widgets/DonutChartWidget";
import type { PipelineStageSlice } from "@/lib/queries/analytics-overview";

type Metric = "amount" | "count";

/** Pipeline by Stage (doc §8) — reuses the Explorer's DonutChartWidget
 *  rather than a bespoke chart, since it already renders exactly this
 *  shape (label/value slices with legend) and links out via router. Both
 *  metrics are already in the fetched data, so the Amount/Count toggle is
 *  a pure client-side re-map — no refetch needed. */
export function PipelineStageChart({ stages }: { stages: PipelineStageSlice[] }) {
  const [metric, setMetric] = useState<Metric>("amount");
  const data = stages.filter((s) => s.count > 0).map((s) => ({ label: s.label, value: metric === "amount" ? Math.round(s.amount) : s.count }));
  return (
    <Card className="h-full">
      <CardHeader className="pb-0 border-0 flex-row items-center justify-between">
        <CardTitle className="text-sm">Pipeline by Stage</CardTitle>
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-[11px] font-semibold">
          <button
            onClick={() => setMetric("amount")}
            className={`px-2 py-0.5 rounded-md transition-colors ${metric === "amount" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"}`}
          >
            Amount
          </button>
          <button
            onClick={() => setMetric("count")}
            className={`px-2 py-0.5 rounded-md transition-colors ${metric === "count" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"}`}
          >
            Count
          </button>
        </div>
      </CardHeader>
      <DonutChartWidget config={{ chartType: "donut", title: "Pipeline by Stage", unit: metric === "amount" ? "currency" : "number" }} data={data} />
    </Card>
  );
}
