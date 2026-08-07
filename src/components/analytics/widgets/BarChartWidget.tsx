"use client";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./shared/ChartTooltip";
import { EmptyState } from "./shared/EmptyState";
import { PAL } from "./shared/palette";
import type { WidgetProps } from "./shared/types";

export function BarChartWidget({ config, data, onDrillDown }: WidgetProps) {
  if (!data.length) return <EmptyState />;
  return (
    <div className="h-[220px] w-full min-w-0 p-4">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Bar
            dataKey="value"
            name={config.title}
            fill={config.color ?? PAL[0]}
            radius={[4, 4, 0, 0]}
            onClick={onDrillDown ? (d) => onDrillDown(d as unknown as (typeof data)[number]) : undefined}
            style={onDrillDown ? { cursor: "pointer" } : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
