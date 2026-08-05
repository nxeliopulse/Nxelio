"use client";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./shared/ChartTooltip";
import { EmptyState } from "./shared/EmptyState";
import { PAL } from "./shared/palette";
import type { WidgetProps } from "./shared/types";

export function LineChartWidget({ config, data }: WidgetProps) {
  if (!data.length) return <EmptyState />;
  const hasSecond = data.some((r) => r.value2 != null);
  return (
    <div className="h-[220px] w-full min-w-0 p-4">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Line type="monotone" dataKey="value" name={config.title} stroke={config.color ?? PAL[0]} strokeWidth={2} dot={{ r: 3 }} />
          {hasSecond && <Line type="monotone" dataKey="value2" name="Target" stroke={PAL[4]} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
