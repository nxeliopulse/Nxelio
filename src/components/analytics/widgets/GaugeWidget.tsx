import { EmptyState } from "./shared/EmptyState";
import { fmt } from "./shared/palette";
import type { WidgetProps } from "./shared/types";

/** Zoho-style "Target Meter" in arc form: a single flat track with one
 *  amber fill arc (no red/yellow/green risk bands, no needle) plus a
 *  "Remaining: N" caption and the target value labeled at the arc's end —
 *  matching Zoho CRM's "Lead Generation Target" gauge. The gauge's max scale
 *  is `row.value2` (a target, when the report/system data provides one) or
 *  `config.gaugeTarget`, falling back to 100. */
export function GaugeWidget({ config, data }: WidgetProps) {
  const row = data[0];
  if (!row) return <EmptyState />;
  const target = row.value2 ?? config.gaugeTarget ?? 100;
  const pct = Math.min(Math.max((row.value / target) * 100, 0), 100);
  const arcLength = 125.6; // semicircle path length used below

  return (
    <div className="flex flex-col items-center justify-center p-4 h-[180px]">
      <div className="w-44 h-24 relative">
        <svg viewBox="0 0 100 58" className="w-full h-full">
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" className="stroke-slate-100 dark:stroke-slate-800" strokeWidth="10" strokeLinecap="round" />
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke={config.color ?? "#F59E0B"}
            strokeWidth="10"
            strokeDasharray={arcLength}
            strokeDashoffset={arcLength - (pct / 100) * arcLength}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute left-0 bottom-0 text-[11px] font-semibold text-slate-400">0</span>
        <span className="absolute right-0 bottom-0 text-[11px] font-semibold text-slate-400">Target: {fmt(target)}</span>
      </div>
      <p className="text-sm font-bold text-slate-800 dark:text-white mt-1">
        {fmt(row.value)}
        <span className="text-slate-400 font-medium"> / {fmt(target)}</span>
      </p>
      <p className="text-xs text-slate-400 font-medium">Remaining: {fmt(Math.max(target - row.value, 0))}</p>
    </div>
  );
}
