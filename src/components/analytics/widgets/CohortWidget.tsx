import { EmptyState } from "./shared/EmptyState";
import type { CohortResult } from "@/lib/analytics-reports";

/** A cohort x breakdown-value grid, shaded by count — e.g. "of the leads
 *  created each month (rows), how many ended up in each status (columns)."
 *  Real counts from real Supabase rows, cross-tabulated client-side. */
export function CohortWidget({ result }: { result: CohortResult }) {
  if (!result.cohorts.length) return <EmptyState message="Pick a date field and a breakdown field with real data." />;
  const max = Math.max(...result.matrix.flat(), 1);

  return (
    <div className="overflow-x-auto p-2">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="py-2 px-3 text-left font-bold text-slate-400">Cohort</th>
            <th className="py-2 px-3 text-right font-bold text-slate-400">Size</th>
            {result.breakdownValues.map((bv) => (
              <th key={bv} className="py-2 px-3 text-right font-bold text-slate-400 whitespace-nowrap">
                {bv}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {result.cohorts.map((cohort, ci) => (
            <tr key={cohort}>
              <td className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-600 whitespace-nowrap">{cohort}</td>
              <td className="py-2 px-3 text-right font-bold text-slate-900 dark:text-white">{result.cohortSizes[ci]}</td>
              {result.matrix[ci].map((count, bi) => {
                const t = count / max;
                return (
                  <td
                    key={bi}
                    className="py-2 px-3 text-right font-semibold"
                    style={{ background: count === 0 ? "transparent" : `rgba(1, 118, 211, ${0.08 + t * 0.5})`, color: t > 0.55 ? "#fff" : undefined }}
                  >
                    {count}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
