"use client";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "./shared/EmptyState";
import { fmt } from "./shared/palette";
import type { QuadrantResult } from "@/lib/analytics-reports";

/** A 2-axis scatter split into 4 quadrants at the median of each axis (not a
 *  fixed 0-crossing, since most CRM numeric fields — deal value, lead score
 *  — are never negative, so a 0-split would put everything in one quadrant). */
export function QuadrantWidget({ result, xLabel, yLabel }: { result: QuadrantResult; xLabel?: string; yLabel?: string }) {
  if (!result.points.length) return <EmptyState message="Pick a data source with at least a couple of numeric records." />;
  return (
    <div className="h-[260px] w-full min-w-0 p-4">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid stroke="#f1f5f9" />
          <XAxis type="number" dataKey="x" name={xLabel ?? "X"} stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(v) => fmt(Number(v))} />
          <YAxis type="number" dataKey="y" name={yLabel ?? "Y"} stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(v) => fmt(Number(v))} />
          <ReferenceLine x={result.xMedian} stroke="#cbd5e1" strokeDasharray="4 3" />
          <ReferenceLine y={result.yMedian} stroke="#cbd5e1" strokeDasharray="4 3" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { label: string; x: number; y: number };
              return (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-md text-xs">
                  <p className="font-bold text-slate-700 dark:text-slate-300 mb-1">{p.label}</p>
                  <p className="text-slate-500">
                    {xLabel ?? "X"}: {fmt(p.x)} · {yLabel ?? "Y"}: {fmt(p.y)}
                  </p>
                </div>
              );
            }}
          />
          <Scatter data={result.points} fill="#0176D3" fillOpacity={0.7} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
