import { ArrowRight, ArrowDown, Sparkles } from "lucide-react";
import { fmt } from "./shared/palette";
import { EmptyState } from "./shared/EmptyState";
import type { WidgetProps } from "./shared/types";

/** Zoho-style "Funnel": several stages, rendering with drop-offs and conversion
 *  metrics. Supports Standard columns, Compact timeline, Segment table, Classic
 *  stack layers, and Path chevrons styles. */
export function FunnelWidget({ config, data }: WidgetProps) {
  if (!data.length) return <EmptyState />;

  const style = config.chartConfig?.funnelStyle ?? "standard";
  const max = Math.max(...data.map((d) => d.value), 1);
  const firstVal = data[0]?.value ?? 1;
  const lastVal = data[data.length - 1]?.value ?? 0;
  const overallConversion = Math.round((lastVal / Math.max(firstVal, 1)) * 1000) / 10;

  // Funnel color generator (classic Zoho shades: red, orange, yellow-green, blue)
  const getFunnelColor = (index: number) => {
    const colors = [
      "bg-rose-500 text-white",
      "bg-amber-500 text-white",
      "bg-emerald-500 text-white",
      "bg-sky-500 text-white",
      "bg-indigo-500 text-white",
    ];
    return colors[index % colors.length];
  };

  if (style === "classic") {
    // Symmetrical centered stack funnel (trapezoidal/tapered layered blocks)
    return (
      <div className="p-4 flex flex-col items-center justify-center space-y-2 h-full min-h-[220px]">
        {data.map((row, i) => {
          const pct = Math.max((row.value / max) * 100, 15);
          const colorClass = getFunnelColor(i);
          return (
            <div
              key={i}
              className={`h-7 flex items-center justify-center rounded-md font-bold text-xs shadow-sm transition-all text-center px-4 ${colorClass}`}
              style={{
                width: `${pct}%`,
                clipPath: "polygon(5% 0%, 95% 0%, 100% 100%, 0% 100%)", // gives it a beautiful tapered look!
              }}
            >
              <span className="truncate">
                {row.label}: {fmt(row.value)}
              </span>
            </div>
          );
        })}
        <div className="text-[10px] font-bold text-slate-400 mt-2">
          Overall Conversion: {overallConversion}%
        </div>
      </div>
    );
  }

  if (style === "compact") {
    // Horizontal steps with conversion rate arrows in between
    return (
      <div className="p-4 flex flex-col justify-between h-full min-h-[220px] space-y-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {data.map((row, i) => {
            const isLast = i === data.length - 1;
            const nextVal = !isLast ? data[i + 1].value : 0;
            const rate = !isLast ? Math.round((nextVal / Math.max(row.value, 1)) * 1000) / 10 : null;

            return (
              <div key={i} className="flex items-center gap-2">
                <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm text-center">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">{row.label}</span>
                  <span className="text-sm font-black text-slate-800 dark:text-white mt-0.5 block">{fmt(row.value)}</span>
                </div>
                {!isLast && (
                  <div className="flex flex-col items-center">
                    <ArrowRight className="h-4 w-4 text-slate-300" />
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{rate}%</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-500/10 rounded-xl flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400 mt-auto">
          <span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-blue-600" /> Conversion Rate</span>
          <span className="font-black text-blue-600 dark:text-blue-400">{overallConversion}%</span>
        </div>
      </div>
    );
  }

  if (style === "path") {
    // Chevron flow arrows pointing horizontally with dropoff metrics underneath
    return (
      <div className="p-4 flex flex-col justify-between h-full min-h-[220px] space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {data.map((row, i) => {
            const isLast = i === data.length - 1;
            const nextVal = !isLast ? data[i + 1].value : 0;
            const dropoffVal = !isLast ? row.value - nextVal : 0;
            const dropoffPct = !isLast ? Math.round((dropoffVal / Math.max(row.value, 1)) * 1000) / 10 : 0;
            const colorClass = getFunnelColor(i);

            return (
              <div key={i} className="flex flex-col space-y-1.5">
                <div className={`p-3 rounded-lg relative overflow-hidden font-bold text-xs ${colorClass}`}>
                  <span className="block opacity-80 uppercase text-[9px] tracking-wider font-semibold">{row.label}</span>
                  <span className="text-sm font-black block mt-0.5">{fmt(row.value)}</span>
                </div>
                {!isLast && (
                  <div className="px-2 text-[10px] text-slate-400 font-medium">
                    Dropoff: <span className="text-rose-500 font-bold">-{fmt(dropoffVal)}</span> ({dropoffPct}%)
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-right text-[10px] font-bold text-slate-400">
          Conversion Rate: {overallConversion}%
        </div>
      </div>
    );
  }

  if (style === "segment") {
    // Table/Tabular flow breakdown
    return (
      <div className="overflow-x-auto p-2">
        <table className="w-full text-left text-xs font-medium text-slate-500 dark:text-slate-400">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px] text-slate-400">Stage</th>
              <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px] text-slate-400 text-right">Count</th>
              <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px] text-slate-400 text-right">Stage Conv.</th>
              <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px] text-slate-400 text-right">Overall Conv.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {data.map((row, i) => {
              const isFirst = i === 0;
              const prevVal = !isFirst ? data[i - 1].value : row.value;
              const stageConv = Math.round((row.value / Math.max(prevVal, 1)) * 1000) / 10;
              const overallConv = Math.round((row.value / Math.max(firstVal, 1)) * 1000) / 10;

              return (
                <tr key={i} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                  <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-700">{row.label}</td>
                  <td className="py-2.5 px-3 font-black text-slate-900 dark:text-white text-right">{fmt(row.value)}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                    {isFirst ? "100%" : `${stageConv}%`}
                  </td>
                  <td className="py-2.5 px-3 text-right text-sky-600 dark:text-sky-400 font-bold">{overallConv}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // default: standard style (Vertical columns with transition arrow indicator boxes)
  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        {data.map((row, i) => {
          const isLast = i === data.length - 1;
          const nextVal = !isLast ? data[i + 1].value : 0;
          const rate = !isLast ? Math.round((nextVal / Math.max(row.value, 1)) * 1000) / 10 : null;
          const heightPct = Math.max((row.value / max) * 100, 10);

          return (
            <div key={i} className="flex flex-col sm:flex-row items-center sm:items-end justify-center gap-4">
              <div className="flex-1 w-full text-center space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate block">{row.label}</span>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden flex flex-col justify-end h-28">
                  <div
                    className="w-full bg-gradient-to-t from-blue-500 to-sky-400 rounded-b-lg flex flex-col justify-end p-2"
                    style={{ height: `${heightPct}%` }}
                  >
                    <span className="text-xs font-black text-white">{fmt(row.value)}</span>
                  </div>
                </div>
              </div>
              {!isLast && (
                <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/10 flex-shrink-0 self-center">
                  <ArrowDown className="h-3 w-3 text-emerald-600 dark:text-emerald-400 sm:hidden" />
                  <ArrowRight className="h-3 w-3 text-emerald-600 dark:text-emerald-400 hidden sm:block" />
                  <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{rate}%</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 flex items-center justify-between text-xs font-bold text-slate-400">
        <span>Conversion Rate</span>
        <span className="text-blue-600 dark:text-blue-400">{overallConversion}%</span>
      </div>
    </div>
  );
}
