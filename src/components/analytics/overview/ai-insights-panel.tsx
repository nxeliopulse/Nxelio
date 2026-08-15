import Link from "next/link";
import { Sparkles, AlertTriangle, TrendingDown, Info } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { AiInsight } from "@/lib/queries/analytics-overview";

const PRIORITY_STYLE: Record<AiInsight["priority"], string> = {
  critical: "bg-rose-50 text-rose-700 border-rose-100",
  high: "bg-amber-50 text-amber-700 border-amber-100",
  medium: "bg-sky-50 text-sky-700 border-sky-100",
  low: "bg-slate-50 text-slate-600 border-slate-100",
};
const PRIORITY_ICON: Record<AiInsight["priority"], typeof Sparkles> = {
  critical: AlertTriangle,
  high: TrendingDown,
  medium: Sparkles,
  low: Info,
};

/** AI Insights panel (doc §11) — max 5 rule-based insights, computed
 *  server-side in buildAiInsights() from the same aggregates already on the
 *  page (no extra AI call needed for Phase 1). */
export function AiInsightsPanel({ insights }: { insights: AiInsight[] }) {
  return (
    <Card className="p-5 h-full">
      <CardHeader className="p-0 border-0 mb-3">
        <CardTitle className="text-sm flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-indigo-500" /> AI Insights</CardTitle>
      </CardHeader>
      {insights.length === 0 ? (
        <p className="text-sm text-slate-400">No insights for the selected period.</p>
      ) : (
        <div className="space-y-2.5">
          {insights.map((insight) => {
            const Icon = PRIORITY_ICON[insight.priority];
            return (
              <div key={insight.id} className={`rounded-lg border p-3 ${PRIORITY_STYLE[insight.priority]}`}>
                <div className="flex items-start gap-2">
                  <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-snug">{insight.title}</p>
                    <p className="text-xs opacity-80 mt-0.5">{insight.description}</p>
                    <Link href={insight.ctaHref} className="text-xs font-bold underline mt-1 inline-block">{insight.ctaLabel}</Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
