"use client";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartTooltip } from "@/components/analytics/widgets/shared/ChartTooltip";
import { PAL } from "@/components/analytics/widgets/shared/palette";
import type { GrowthPoint } from "@/lib/queries/analytics-prospects";

/** Prospect Growth Over Time (doc §4) — 3 series (Total Added/Enriched/
 *  Qualified). Bespoke, not built on LineChartWidget, since that widget
 *  only supports a 2-series value/value2 shape. */
export function ProspectGrowthChart({ points }: { points: GrowthPoint[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0">
        <CardTitle className="text-sm">Prospect Growth Over Time</CardTitle>
      </CardHeader>
      <div className="h-[260px] w-full min-w-0 p-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart data={points} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <XAxis dataKey="bucketLabel" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="added" name="Total Added" stroke={PAL[0]} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="enriched" name="Enriched" stroke={PAL[2]} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="qualified" name="Qualified" stroke={PAL[4]} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
