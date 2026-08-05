"use client";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "./shared/EmptyState";
import { PAL } from "./shared/palette";
import type { WidgetProps } from "./shared/types";

interface PieLabelProps {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
  index?: number;
}

export function DonutChartWidget({ data, onDrillDown }: WidgetProps) {
  if (!data.length) return <EmptyState />;
  const total = data.reduce((s, d) => s + d.value, 0);

  // Zoho-style leader-line labels outside the ring: "Name N (P%)". Kept
  // alongside the legend list below rather than replacing it.
  function renderLabel(props: PieLabelProps) {
    const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, index = 0 } = props;
    const row = data[index];
    if (!row) return null;
    const RAD = Math.PI / 180;
    const x = cx + (outerRadius + 14) * Math.cos(-midAngle * RAD);
    const y = cy + (outerRadius + 14) * Math.sin(-midAngle * RAD);
    const pct = total ? Math.round((row.value / total) * 100) : 0;
    return (
      <text x={x} y={y} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={10} className="fill-slate-500 dark:fill-slate-400 font-medium">
        {row.label} {row.value} ({pct}%)
      </text>
    );
  }

  return (
    <div className="p-4">
      <div className="h-[210px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={45}
              outerRadius={62}
              paddingAngle={2}
              stroke="none"
              label={renderLabel}
              labelLine={{ stroke: "#cbd5e1" }}
              onClick={onDrillDown ? (_, i) => onDrillDown(data[i]) : undefined}
              style={onDrillDown ? { cursor: "pointer" } : undefined}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PAL[i % PAL.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0];
                const pct = total ? Math.round((Number(p.value) / total) * 100) : 0;
                return (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-md text-xs">
                    <span className="font-bold">{p.name}</span>
                    <span className="ml-1.5">{p.value} ({pct}%)</span>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 space-y-1">
        {data.slice(0, 6).map((d, i) => (
          <div key={i} className="flex items-center justify-between text-xs font-medium">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 truncate">
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: PAL[i % PAL.length] }} />
              {d.label}
            </span>
            <span className="text-slate-900 dark:text-white font-bold flex-shrink-0">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
