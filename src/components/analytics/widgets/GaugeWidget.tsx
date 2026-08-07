import { EmptyState } from "./shared/EmptyState";
import { fmt } from "./shared/palette";
import type { WidgetProps } from "./shared/types";

/** Zoho-style "Target Meter" in multiple layouts: Dial Gauge, Traffic Lights,
 *  Bar, and Multiple Bar. Supports configuring targets via `config.gaugeTarget`
 *  or `row.value2`. */
export function GaugeWidget({ config, data }: WidgetProps) {
  if (!data.length) return <EmptyState />;

  const style = config.chartConfig?.targetMeterStyle ?? "dial";

  // Calculate targets & scale for multi-bar
  if (style === "multibar" && data.length > 1) {
    return (
      <div className="p-4 space-y-4 overflow-y-auto max-h-[220px]">
        {data.map((row, idx) => {
          const target = row.value2 ?? config.gaugeTarget ?? 100;
          const maxScale = Math.max(target * 1.15, row.value, 1);
          const achievedPct = Math.min((row.value / maxScale) * 100, 100);
          const targetPct = Math.min((target / maxScale) * 100, 100);

          return (
            <div key={idx} className="space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>{row.label}</span>
                <span>
                  {fmt(row.value)} <span className="text-slate-400">/ Target: {fmt(target)}</span>
                </span>
              </div>
              <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden relative">
                {/* Achieved progress */}
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-teal-400 rounded-md flex items-center px-2"
                  style={{ width: `${achievedPct}%` }}
                >
                  {achievedPct > 15 && (
                    <span className="text-[10px] font-black text-white">{fmt(row.value)}</span>
                  )}
                </div>
                {/* Target vertical marker */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-slate-900 dark:bg-white z-10"
                  style={{ left: `${targetPct}%` }}
                />
                <span
                  className="absolute text-[8px] font-bold text-slate-500 z-10 bg-white/80 dark:bg-slate-900/80 px-1 rounded -top-0.5"
                  style={{ left: `${targetPct + 1}%` }}
                >
                  Tgt
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Single-value styles
  const row = data[0];
  if (!row) return <EmptyState />;
  const target = row.value2 ?? config.gaugeTarget ?? 100;

  if (style === "bar" || style === "multibar") {
    // Render horizontal Bar style
    const maxScale = Math.max(target * 1.15, row.value, 1);
    const achievedPct = Math.min((row.value / maxScale) * 100, 100);
    const targetPct = Math.min((target / maxScale) * 100, 100);
    const remaining = Math.max(target - row.value, 0);

    return (
      <div className="p-5 flex flex-col justify-center h-full min-h-[140px] space-y-3">
        <div className="h-7 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden relative">
          {/* Achieved Progress */}
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-teal-400 rounded-lg flex items-center px-3"
            style={{ width: `${achievedPct}%` }}
          >
            {achievedPct > 15 && (
              <span className="text-xs font-black text-white">{fmt(row.value)}</span>
            )}
          </div>
          {/* Target marker line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-slate-900 dark:bg-white z-10"
            style={{ left: `${targetPct}%` }}
          />
          <span
            className="absolute text-[9px] font-bold text-slate-500 z-10 bg-white/80 dark:bg-slate-900/80 px-1 rounded top-1"
            style={{ left: `${targetPct + 1}%` }}
          >
            Target: {fmt(target)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
          <span>Achieved: {fmt(row.value)}</span>
          <span>Remaining: {fmt(remaining)}</span>
        </div>
      </div>
    );
  }

  const pct = Math.min(Math.max((row.value / target) * 100, 0), 100);
  const arcLength = 125.6; // semicircle path length

  if (style === "traffic") {
    // Semicircle needle rotation angle (180deg to 0deg)
    const angle = 180 - (pct / 100) * 180;

    return (
      <div className="flex flex-col items-center justify-center p-4 h-[180px]">
        <div className="w-44 h-24 relative">
          <svg viewBox="0 0 100 58" className="w-full h-full">
            {/* Semicircle track divided into danger sectors */}
            {/* Red sector (0-33%) */}
            <path
              d="M 10 50 A 40 40 0 0 1 36.8 23.2"
              fill="none"
              stroke="#EF4444"
              strokeWidth="10"
              strokeLinecap="round"
            />
            {/* Yellow/Orange sector (33-66%) */}
            <path
              d="M 36.8 23.2 A 40 40 0 0 1 63.2 23.2"
              fill="none"
              stroke="#F59E0B"
              strokeWidth="10"
            />
            {/* Green sector (66-100%) */}
            <path
              d="M 63.2 23.2 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="#10B981"
              strokeWidth="10"
              strokeLinecap="round"
            />
            {/* Needle */}
            <g transform={`translate(50, 50) rotate(${-angle})`}>
              <line x1="0" y1="0" x2="35" y2="0" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="0" cy="0" r="4" fill="#334155" />
            </g>
          </svg>
          <span className="absolute left-0 bottom-0 text-[10px] font-semibold text-slate-400">0</span>
          <span className="absolute right-0 bottom-0 text-[10px] font-semibold text-slate-400">Target: {fmt(target)}</span>
        </div>
        <p className="text-sm font-bold text-slate-800 dark:text-white mt-1">
          {fmt(row.value)}
          <span className="text-slate-400 font-medium"> / {fmt(target)}</span>
        </p>
        <p className="text-xs text-slate-400 font-medium">Remaining: {fmt(Math.max(target - row.value, 0))}</p>
      </div>
    );
  }

  // default: dial gauge
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
        <span className="absolute left-0 bottom-0 text-[10px] font-semibold text-slate-400">0</span>
        <span className="absolute right-0 bottom-0 text-[10px] font-semibold text-slate-400">Target: {fmt(target)}</span>
      </div>
      <p className="text-sm font-bold text-slate-800 dark:text-white mt-1">
        {fmt(row.value)}
        <span className="text-slate-400 font-medium"> / {fmt(target)}</span>
      </p>
      <p className="text-xs text-slate-400 font-medium">Remaining: {fmt(Math.max(target - row.value, 0))}</p>
    </div>
  );
}
