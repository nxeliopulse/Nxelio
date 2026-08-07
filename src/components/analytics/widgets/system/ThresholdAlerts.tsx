import { Trophy, Target, Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "../shared/EmptyState";
import type { AlertItem } from "@/lib/analytics-system-widgets";

const ICONS: Record<AlertItem["type"], React.ReactNode> = {
  positive: <Trophy size={13} />,
  info: <Zap size={13} />,
  attention: <Clock size={13} />,
  warning: <Target size={13} />,
};

const CLASS: Record<AlertItem["type"], string> = {
  positive: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400",
  info: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400",
  attention: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400",
  warning: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400",
};

/** A plain, honestly-labeled list of deterministic threshold rules — see
 *  computeThresholdAlerts() in src/lib/analytics-system-widgets.ts. Renamed
 *  from "AI Predictive Insights"; no AI/sparkle framing here on purpose. */
export function ThresholdAlerts({ items }: { items: AlertItem[] }) {
  if (!items.length) return <EmptyState />;
  return (
    <div className="p-4 space-y-2.5">
      {items.map((it, i) => (
        <div key={i} className={cn("rounded-xl border p-3", CLASS[it.type])}>
          <div className="flex items-center gap-2 mb-1 font-bold text-xs">
            {ICONS[it.type]}
            {it.title}
          </div>
          <p className="text-xs opacity-90 mb-1.5">{it.body}</p>
          <p className="text-[11px] font-semibold opacity-80">→ {it.recommendation}</p>
        </div>
      ))}
    </div>
  );
}
