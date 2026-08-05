import { ArrowUp, ArrowDown } from "lucide-react";
import { fmt } from "./shared/palette";
import { EmptyState } from "./shared/EmptyState";
import type { ComparatorResult } from "@/lib/analytics-reports";

/** Zoho's "Comparator": several metrics, each shown side-by-side for the
 *  current vs. previous period — matches the "Last 3 Months Performance
 *  Monitor" reference screenshot's rows-of-metrics/columns-of-periods
 *  layout. */
export function ComparatorWidget({ result }: { result: ComparatorResult }) {
  if (!result.rows.length) return <EmptyState message="Pick at least one metric to compare." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-slate-100 dark:border-slate-800">
            <th className="py-2 px-4 font-bold text-slate-400 text-xs uppercase tracking-wide"> </th>
            <th className="py-2 px-4 font-bold text-slate-500 text-xs">{result.periodLabels[0]}</th>
            <th className="py-2 px-4 font-bold text-slate-400 text-xs">{result.periodLabels[1]}</th>
            <th className="py-2 px-4 font-bold text-slate-400 text-xs">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {result.rows.map((row, i) => {
            const delta = row.previous ? Math.round(((row.current - row.previous) / row.previous) * 1000) / 10 : null;
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
