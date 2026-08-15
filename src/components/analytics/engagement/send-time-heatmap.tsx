import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { HeatmapCell } from "@/lib/queries/analytics-engagement";
import { DAY_LABELS, HOUR_BLOCK_LABELS } from "@/lib/analytics/engagement-metrics";

function intensity(value: number, max: number): string {
  if (max === 0 || value === 0) return "bg-slate-50 text-slate-300";
  const pct = value / max;
  if (pct > 0.75) return "bg-blue-600 text-white";
  if (pct > 0.5) return "bg-blue-400 text-white";
  if (pct > 0.25) return "bg-blue-200 text-blue-900";
  return "bg-blue-100 text-blue-800";
}

/** Best Time / Day Heatmap (doc §8) — cells show Reply Rate for that
 *  day/hour bucket, using real send + reply timestamps. */
export function SendTimeHeatmap({ cells }: { cells: HeatmapCell[] }) {
  const byKey = new Map(cells.map((c) => [`${c.day}|${c.hourBlock}`, c.value]));
  const max = Math.max(...cells.map((c) => c.value), 1);

  return (
    <Card className="p-4">
      <CardHeader className="p-0 border-0 mb-3"><CardTitle className="text-sm">Best Time / Day (Reply Rate)</CardTitle></CardHeader>
      <div className="overflow-x-auto">
        <table className="text-xs w-full">
          <thead>
            <tr>
              <th className="text-left font-semibold text-slate-400 pb-2 pr-2"></th>
              {HOUR_BLOCK_LABELS.map((h) => <th key={h} className="text-center font-semibold text-slate-400 pb-2 px-1">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {DAY_LABELS.map((day) => (
              <tr key={day}>
                <td className="pr-2 font-semibold text-slate-500 whitespace-nowrap">{day.slice(0, 3)}</td>
                {HOUR_BLOCK_LABELS.map((h) => {
                  const value = byKey.get(`${day}|${h}`) ?? 0;
                  return (
                    <td key={h} className="p-1">
                      <div className={`h-8 rounded-md flex items-center justify-center font-bold ${intensity(value, max)}`} title={`${day} ${h}: ${value}% reply rate`}>
                        {value > 0 ? `${value}%` : ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
