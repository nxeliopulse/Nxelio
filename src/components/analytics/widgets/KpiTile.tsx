import { TrendingUp, TrendingDown, ArrowUp, ArrowDown } from "lucide-react";
import { formatValue } from "./shared/palette";
import { EmptyState } from "./shared/EmptyState";
import type { WidgetProps } from "./shared/types";

/** A report with no dimension resolves to a single-row array — that's what
 *  renders here. `value2`, when present, is treated as a comparison target
 *  (e.g. "vs last period") and rendered as a trend delta. Supports Standard,
 *  Growth Index, and Basic KPI styles. */
export function KpiTile({ config, data }: WidgetProps) {
  const row = data[0];
  if (!row) return <EmptyState />;
  const delta = row.value2 != null ? row.value - row.value2 : null;
  const pct = delta != null && row.value2 ? Math.round((delta / row.value2) * 1000) / 10 : null;

  const style = config.chartConfig?.kpiStyle ?? "standard";

  const formattedVal = formatValue(row.value, config.unit);
  const formattedVal2 = row.value2 != null ? formatValue(row.value2, config.unit) : null;

  if (style === "basic") {
    return (
      <div className="p-5 flex flex-col justify-center h-full min-h-[120px]">
        <h4 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          {formattedVal}
        </h4>
      </div>
    );
  }

  if (style === "growth") {
    return (
      <div className="p-5 flex flex-col justify-center h-full min-h-[120px]">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            {formattedVal}
          </h4>
          {pct != null && (
            <div className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 flex-shrink-0 ${
              pct >= 0 
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400" 
                : "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400"
            }`}>
              {pct >= 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              {Math.abs(pct)}%
            </div>
          )}
        </div>
        {formattedVal2 != null && (
          <p className="text-xs text-slate-400 mt-2 font-medium">Previous: {formattedVal2}</p>
        )}
      </div>
    );
  }

  // default: standard
  return (
    <div className="p-5 flex flex-col justify-center h-full min-h-[120px]">
      <div className="flex items-baseline gap-2">
        <h4 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          {formattedVal}
        </h4>
        {pct != null && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${
            pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
          }`}>
            {pct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {pct >= 0 ? `+${pct}%` : `${pct}%`}
          </span>
        )}
      </div>
      {formattedVal2 != null && (
        <p className="text-xs text-slate-400 mt-2 font-medium">Previous: {formattedVal2}</p>
      )}
    </div>
  );
}
