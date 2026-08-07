import { EmptyState } from "./shared/EmptyState";
import { formatValue, fmt } from "./shared/palette";
import type { WidgetProps } from "./shared/types";

function niceMax(n: number): number {
  if (n <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)));
  const normalized = n / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Zoho-style "Target Meter" in horizontal bullet-bar form: an achieved-value
 *  bar against a target line on a shared axis — the sibling of GaugeWidget's
 *  arc form. Matches Zoho CRM's "Revenue Target" component. */
export function TargetBarWidget({ config, data }: WidgetProps) {
  const row = data[0];
  if (!row) return <EmptyState />;
  const target = row.value2 ?? config.gaugeTarget ?? row.value;
  const axisMax = niceMax(Math.max(target, row.value) * 1.15);
  const achievedPct = Math.min((row.value / axisMax) * 100, 100);
  const targetPct = Math.min((target / axisMax) * 100, 100);
  const ticks = Array.from({ length: 6 }, (_, i) => Math.round((axisMax / 5) * i));

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-500 w-16 flex-shrink-0 truncate">{row.label}</span>
        <div className="flex-1 relative h-7">
          <div className="absolute inset-0 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="absolute inset-y-0 left-0 rounded-md bg-emerald-500 flex items-center px-2" style={{ width: `${Math.max(achievedPct, 4)}%` }}>
            <span className="text-[11px] font-bold text-white whitespace-nowrap">{formatValue(row.value, config.unit)}</span>
          </div>
          <div className="absolute inset-y-[-3px] w-0.5 bg-slate-700 dark:bg-slate-300" style={{ left: `${targetPct}%` }} title={`Target: ${fmt(target)}`} />
        </div>
      </div>
      <div className="flex justify-between pl-[76px] text-[10px] text-slate-400 font-medium">
        {ticks.map((t, i) => (
          <span key={i}>{fmt(t)}</span>
        ))}
      </div>
      <div className="flex items-center gap-4 pl-[76px] text-[11px] font-medium text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-500 inline-block" /> Achieved
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-0.5 bg-slate-700 dark:bg-slate-300 inline-block" /> Target: {fmt(target)}
        </span>
      </div>
    </div>
  );
}
