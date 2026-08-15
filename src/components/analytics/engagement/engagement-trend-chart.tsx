"use client";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartTooltip } from "@/components/analytics/widgets/shared/ChartTooltip";
import { PAL } from "@/components/analytics/widgets/shared/palette";
import type { EngagementTrendPoint } from "@/lib/queries/analytics-engagement";

export function EngagementTrendChart({ points }: { points: EngagementTrendPoint[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Engagement Trend Over Time</CardTitle></CardHeader>
      <div className="h-[260px] w-full min-w-0 p-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart data={points} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <XAxis dataKey="bucketLabel" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="sent" name="Sent" stroke={PAL[0]} strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="opened" name="Opened" stroke={PAL[1]} strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="clicked" name="Clicked" stroke={PAL[2]} strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="replied" name="Replied" stroke={PAL[4]} strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
