"use client";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { EmptyState } from "../shared/EmptyState";

export function ScatterSystem({ points }: { points: { x: number; y: number; z: number; name: string }[] }) {
  if (!points.length) return <EmptyState />;
  return (
    <div className="h-[240px] w-full min-w-0 p-4">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <ScatterChart margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
          <CartesianGrid stroke="#f1f5f9" />
          <XAxis type="number" dataKey="x" name="Open rate" unit="%" stroke="#94a3b8" fontSize={11} tickLine={false} />
          <YAxis type="number" dataKey="y" name="Reply rate" unit="%" stroke="#94a3b8" fontSize={11} tickLine={false} />
          <ZAxis type="number" dataKey="z" range={[60, 300]} name="Sent" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { name: string; x: number; y: number; z: number };
              return (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-md text-xs">
                  <p className="font-bold text-slate-700 dark:text-slate-300 mb-1">{p.name}</p>
                  <p className="text-slate-500">Open {p.x}% · Reply {p.y}% · Sent {p.z}</p>
                </div>
              );
            }}
          />
          <Scatter data={points} fill="#0176D3" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
