"use client";
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "./shared/EmptyState";
import { fmt } from "./shared/palette";
import type { WidgetProps } from "./shared/types";

/** Flags points more than `config.gaugeTarget` (repurposed as the standard-
 *  deviation multiplier, default 2) away from the series' mean — a plain
 *  statistical threshold, not machine learning. Labeled and computed
 *  honestly: this is real math over your real data, not a trained model. */
export function AnomalyWidget({ config, data }: WidgetProps) {
  if (!data.length) return <EmptyState />;
  const threshold = config.gaugeTarget ?? 2;
  const values = data.map((d) => d.value);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);
  const upper = mean + threshold * stddev;
  const lower = Math.max(mean - threshold * stddev, 0);

  const chartData = data.map((d) => ({ ...d, band: [lower, upper], isAnomaly: stddev > 0 && Math.abs(d.value - mean) > threshold * stddev }));
  const anomalyCount = chartData.filter((d) => d.isAnomaly).length;

  return (
    <div className="p-4">
      <div className="h-[200px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
            <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof chartData)[number];
                return (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-md text-xs">
                    <p className="font-bold text-slate-700 dark:text-slate-300">{d.label}</p>
                    <p className="text-slate-500">{fmt(d.value)}{d.isAnomaly && <span className="text-rose-500 font-bold ml-1.5">Outlier</span>}</p>
                  </div>
                );
              }}
            />
            <Area dataKey="band" fill="#94a3b8" fillOpacity={0.08} stroke="none" />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#0176D3"
              strokeWidth={2}
              dot={(props: { cx?: number; cy?: number; payload?: { isAnomaly?: boolean } }) => {
                const isAnomaly = props.payload?.isAnomaly;
                return <circle key={`${props.cx}-${props.cy}`} cx={props.cx} cy={props.cy} r={isAnomaly ? 5 : 3} fill={isAnomaly ? "#EF4444" : "#0176D3"} />;
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-slate-400 text-center mt-1">
        {anomalyCount > 0 ? `${anomalyCount} point${anomalyCount === 1 ? "" : "s"} more than ${threshold}× the standard deviation from the average` : "No points outside the normal range"}
      </p>
    </div>
  );
}
