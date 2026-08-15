"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartTooltip } from "@/components/analytics/widgets/shared/ChartTooltip";
import { PAL } from "@/components/analytics/widgets/shared/palette";
import type { AiComparisonMetric } from "@/lib/queries/analytics-ai-performance";

/** AI vs Non-AI comparison (doc §54) — grouped bars, not a causal claim,
 *  just a side-by-side of observed rates. */
export function ComparisonChart({ rows }: { rows: AiComparisonMetric[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0">
        <CardTitle className="text-sm">AI-Assisted vs Non-AI-Assisted Prospects</CardTitle>
      </CardHeader>
      <div className="h-[240px] w-full min-w-0 p-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={rows} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="metric" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} unit="%" />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="aiAssisted" name="AI-Assisted" fill={PAL[0]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="nonAiAssisted" name="Non-AI-Assisted" fill={PAL[3]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
