import { TrendingUp, TrendingDown } from "lucide-react";
import { formatValue } from "./shared/palette";
import { EmptyState } from "./shared/EmptyState";
import type { WidgetProps } from "./shared/types";

/** A report with no dimension resolves to a single-row array — that's what
 *  renders here. `value2`, when present, is treated as a comparison target
 *  (e.g. "vs last period") and rendered as a trend delta. */
export function KpiTile({ config, data }: WidgetProps) {
  const row = data[0];
  if (!row) return <EmptyState />;
  const delta = row.value2 != null ? row.value - row.value2 : null;
  const pct = delta != null && row.value2 ? Math.round((delta / row.value2) * 1000) / 10 : null;

  return (
    <div className="p-5 flex flex-col justify-center h-full min-h-[120px]">
      <h4 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
        {formatValue(row.value, config.unit)}
      </h4>
      {pct != null && (
        <div className="flex items-center gap-1.5 mt-2 text-xs font-bold">
          {pct >= 0 ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-3.5 w-3.5" /> +{pct}%
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
              <TrendingDown className="h-3.5 w-3.5" /> {pct}%
            </span>
          )}
          <span className="text-slate-400">vs target</span>
        </div>
      )}
    </div>
  );
}
