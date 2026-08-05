import { formatValue } from "./shared/palette";
import { EmptyState } from "./shared/EmptyState";
import type { WidgetProps } from "./shared/types";

const ZONE_COLORS = ["#0176D3", "#34BEC2", "#7C3AED", "#EA580C", "#E077AE", "#2E7D32"];

/** Zoho's "Zone" component: performance broken out by a category (territory,
 *  region, owner, ...), sorted descending as horizontal segmented bars —
 *  reuses the exact same metric+groupBy data as Bar/Donut, just a different
 *  visual treatment. */
export function ZoneWidget({ config, data }: WidgetProps) {
  if (!data.length) return <EmptyState />;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((d) => d.value), 1);

  return (
    <div className="p-5 space-y-2.5">
      {sorted.slice(0, 10).map((row, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-24 flex-shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-400 truncate">{row.label}</span>
          <div className="flex-1 h-6 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-md flex items-center justify-end px-2"
              style={{ width: `${Math.max((row.value / max) * 100, 6)}%`, background: ZONE_COLORS[i % ZONE_COLORS.length] }}
            >
              <span className="text-[11px] font-bold text-white whitespace-nowrap">{formatValue(row.value, config.unit)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
