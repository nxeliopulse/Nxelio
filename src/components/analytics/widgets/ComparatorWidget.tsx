import { ArrowUp, ArrowDown, Award } from "lucide-react";
import { fmt } from "./shared/palette";
import { EmptyState } from "./shared/EmptyState";
import type { ComparatorResult } from "@/lib/analytics-reports";
import type { WidgetConfig } from "./shared/types";

/** Zoho's "Comparator": several metrics, each shown side-by-side for the
 *  current vs. previous period. Supports Classic table, Elegant cards,
 *  and Sport comparison bars styles. */
export function ComparatorWidget({ config, result }: { config: WidgetConfig; result: ComparatorResult }) {
  if (!result.rows.length) return <EmptyState message="Pick at least one metric to compare." />;

  const style = config.chartConfig?.comparatorStyle ?? "classic";

  // Calculate global max for progress bars in "Sport" style
  const maxVal = Math.max(
    ...result.rows.flatMap((r) => [r.current, r.previous]),
    1
  );

  // Helper for trend calculation
  const getTrend = (current: number, previous: number) => {
    if (!previous) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  };

  if (style === "sport") {
    return (
      <div className="p-4 space-y-5">
        {result.rows.map((row, idx) => {
          const trend = getTrend(row.current, row.previous);
          const currentPct = Math.max((row.current / maxVal) * 100, 3);
          const previousPct = Math.max((row.previous / maxVal) * 100, 3);

          // Alternating sport fills (red/orange/green)
          const barColorClass =
            row.label.toLowerCase().includes("lost") || row.label.toLowerCase().includes("cost")
              ? "bg-rose-500"
              : row.label.toLowerCase().includes("deal") || row.label.toLowerCase().includes("lead")
              ? "bg-amber-500"
              : "bg-emerald-500";

          return (
            <div key={idx} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{row.label}</span>
                {trend !== null && (
                  <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${trend >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {trend >= 0 ? "+" : ""}{trend}%
                  </span>
                )}
              </div>
              <div className="space-y-1.5 pl-2 border-l-2 border-slate-100 dark:border-slate-800">
                {/* Current Period Bar */}
                <div className="flex items-center gap-3">
                  <span className="w-16 flex-shrink-0 text-[10px] text-slate-400 font-bold uppercase truncate">{result.periodLabels[0]}</span>
                  <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden relative">
                    <div className={`h-full ${barColorClass} rounded-md transition-all`} style={{ width: `${currentPct}%` }} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-700 dark:text-slate-300">
                      {fmt(row.current)}
                    </span>
                  </div>
                </div>
                {/* Previous Period Bar */}
                <div className="flex items-center gap-3">
                  <span className="w-16 flex-shrink-0 text-[10px] text-slate-400 font-bold uppercase truncate">{result.periodLabels[1]}</span>
                  <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden relative">
                    <div className={`h-full ${barColorClass} opacity-60 rounded-md transition-all`} style={{ width: `${previousPct}%` }} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-700 dark:text-slate-300">
                      {fmt(row.previous)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (style === "elegant") {
    return (
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {result.rows.map((row, idx) => {
          const trend = getTrend(row.current, row.previous);
          return (
            <div key={idx} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900/20 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-7 w-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Award className="h-4 w-4" />
                  </div>
                  <h5 className="text-sm font-bold text-slate-700 dark:text-slate-300">{row.label}</h5>
                </div>
                <div className="grid grid-cols-2 gap-3 py-1 border-t border-b border-slate-50 dark:border-slate-800/60 my-2">
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider">{result.periodLabels[0]}</span>
                    <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block">{fmt(row.current)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider">{result.periodLabels[1]}</span>
                    <span className="text-base font-black text-slate-500 dark:text-slate-400 mt-0.5 block">{fmt(row.previous)}</span>
                  </div>
                </div>
              </div>
              {trend !== null && (
                <div className="mt-2 flex items-center gap-1.5 text-xs font-bold">
                  {trend >= 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-full">
                      <ArrowUp className="h-3 w-3" /> +{trend}%
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 px-2 py-0.5 rounded-full">
                      <ArrowDown className="h-3 w-3" /> {trend}%
                    </span>
                  )}
                  <span className="text-slate-400 font-medium">vs target</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // default: classic
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-slate-100 dark:border-slate-800">
            <th className="py-2 px-4 font-bold text-slate-400 text-xs uppercase tracking-wide">Metric</th>
            <th className="py-2 px-4 font-bold text-slate-500 text-xs">{result.periodLabels[0]}</th>
            <th className="py-2 px-4 font-bold text-slate-400 text-xs">{result.periodLabels[1]}</th>
            <th className="py-2 px-4 font-bold text-slate-400 text-xs">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {result.rows.map((row, i) => {
            const delta = getTrend(row.current, row.previous);
            return (
              <tr key={i}>
                <td className="py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">{row.label}</td>
                <td className="py-3 px-4 font-black text-slate-900 dark:text-white">{fmt(row.current)}</td>
                <td className="py-3 px-4 text-slate-400">{fmt(row.previous)}</td>
                <td className="py-3 px-4">
                  {delta === null ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {delta >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {Math.abs(delta)}%
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
