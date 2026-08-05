import { ArrowRight } from "lucide-react";
import { formatValue } from "./shared/palette";
import { EmptyState } from "./shared/EmptyState";
import type { WidgetProps } from "./shared/types";

/** Zoho's "Stage" component: a connected, left-to-right sequence of boxes —
 *  the same metric+groupBy data as Funnel, kept in the order the report
 *  returned it (pick a report grouped by a naturally-ordered field, like
 *  pipeline stage, for a sensible sequence) but shown as equal-sized
 *  connected steps rather than a shrinking funnel shape. */
export function StageWidget({ config, data }: WidgetProps) {
  if (!data.length) return <EmptyState />;
  return (
    <div className="p-5 flex items-stretch gap-1 overflow-x-auto">
      {data.map((row, i) => (
        <div key={i} className="flex items-center flex-shrink-0">
          <div className="min-w-[110px] rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 px-3 py-2.5 text-center">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate">{row.label}</p>
            <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{formatValue(row.value, config.unit)}</p>
          </div>
          {i < data.length - 1 && <ArrowRight className="h-4 w-4 text-slate-300 flex-shrink-0 mx-1" />}
        </div>
      ))}
    </div>
  );
}
