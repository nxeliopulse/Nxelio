"use client";
import { Area, AreaChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./shared/ChartTooltip";
import { EmptyState } from "./shared/EmptyState";
import { PAL } from "./shared/palette";
import type { WidgetProps } from "./shared/types";

/** `value2`, when present (e.g. a forecast's quota line), renders as a
 *  dashed overlay on top of the primary area series. */
export function AreaChartWidget({ config, data }: WidgetProps) {
  if (!data.length) return <EmptyState />;
  const hasSecond = data.some((r) => r.value2 != null);
  const color = config.color ?? PAL[0];
  return (
    <div className="h-[220px] w-full min-w-0 p-4">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="value" name={config.title} stroke={color} strokeWidth={2} fill="url(#areaFill)" />
          {hasSecond && <Line type="monotone" dataKey="value2" name="Target" stroke={PAL[4]} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
