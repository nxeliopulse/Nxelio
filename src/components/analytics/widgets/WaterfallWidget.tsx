"use client";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "./shared/EmptyState";
import { fmt, formatValue } from "./shared/palette";
import type { WidgetProps } from "./shared/types";

interface WaterfallBar {
  label: string;
  base: number;
  delta: number;
  positive: boolean;
  end: number;
  isTotal?: boolean;
}

/** Builds the running-total bars without mutating a loop variable (each step
 *  produces a new accumulator instead of reassigning one) so this stays safe
 *  to call during render. */
function buildWaterfallBars(rows: WidgetProps["data"]): WaterfallBar[] {
  const { bars } = rows.reduce<{ bars: WaterfallBar[]; running: number }>(
    (acc, row) => {
      const end = acc.running + row.value;
      const bar: WaterfallBar = { label: row.label, base: Math.min(acc.running, end), delta: Math.abs(row.value), positive: row.value >= 0, end };
      return { bars: [...acc.bars, bar], running: end };
    },
    { bars: [], running: 0 }
  );
  return bars;
}

/** A running-total bridge chart: each bar starts where the previous one
 *  ended. Built with a transparent "base" stack segment (the offset) plus a
 *  colored "delta" segment — Recharts has no dedicated waterfall primitive,
 *  this is the standard way to build one on top of a stacked bar chart.
 *  Rows are used in the order the report returned them, so pick a report
 *  grouped by a naturally-ordered field (e.g. month, or pipeline stage) for
 *  a bridge that reads sensibly left-to-right. */
export function WaterfallWidget({ config, data }: WidgetProps) {
  if (!data.length) return <EmptyState />;

  const bars = buildWaterfallBars(data);
  const finalTotal = bars.length ? bars[bars.length - 1].end : 0;
  const chartData: WaterfallBar[] = [...bars, { label: "Total", base: 0, delta: Math.abs(finalTotal), positive: finalTotal >= 0, end: finalTotal, isTotal: true }];

  return (
    <div className="p-4">
      <div className="h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
            <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(Number(v))} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as WaterfallBar;
                return (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-md text-xs">
                    <p className="font-bold text-slate-700 dark:text-slate-300">{d.label}</p>
                    <p className="text-slate-500">{d.isTotal ? "Total" : d.positive ? "+" : "-"}{formatValue(d.delta, config.unit)}</p>
                    <p className="text-slate-400">Running total: {formatValue(d.end, config.unit)}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="base" stackId="w" fill="transparent" />
            <Bar dataKey="delta" stackId="w" radius={[3, 3, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.isTotal ? "#0176D3" : d.positive ? "#10B981" : "#EF4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 justify-center text-[11px] font-medium text-slate-500 mt-1">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-500 inline-block" /> Increase
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-rose-500 inline-block" /> Decrease
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-blue-500 inline-block" /> Total
        </span>
      </div>
    </div>
  );
}
