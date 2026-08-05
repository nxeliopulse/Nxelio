"use client";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltip } from "../shared/ChartTooltip";
import { EmptyState } from "../shared/EmptyState";

export function RadarSystem({ points }: { points: { axis: string; value: number }[] }) {
  if (!points.length) return <EmptyState />;
  return (
    <div className="h-[240px] w-full min-w-0 p-4">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <RadarChart data={points}>
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: "#94a3b8" }} />
          <PolarRadiusAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
          <Radar dataKey="value" stroke="#0176D3" fill="#0176D3" fillOpacity={0.25} />
          <Tooltip content={<ChartTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
