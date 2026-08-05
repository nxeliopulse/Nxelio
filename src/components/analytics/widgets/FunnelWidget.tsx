import { fmt } from "./shared/palette";
import { EmptyState } from "./shared/EmptyState";
import type { WidgetProps } from "./shared/types";

/** A stepped horizontal-bar funnel — matches the old analytics-view.tsx's
 *  approach (div bars, not a Recharts FunnelChart primitive, which this repo
 *  never imported). Rows are shown in the order the report engine returned
 *  them; pass a report with an ordered group-by (e.g. pipeline stage) for a
 *  sensible funnel shape. */
export function FunnelWidget({ data }: WidgetProps) {
  if (!data.length) return <EmptyState />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="p-5 space-y-2.5">
      {data.map((row, i) => {
        const pct = Math.max((row.value / max) * 100, 4);
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-28 flex-shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-400 truncate text-right">{row.label}</span>
            <div className="flex-1 h-6 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden">
              <div
                className="h-full rounded-md bg-gradient-to-r from-blue-500 to-teal-400 flex items-center justify-end px-2"
                style={{ width: `${pct}%` }}
              >
                <span className="text-[11px] font-bold text-white">{fmt(row.value)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
