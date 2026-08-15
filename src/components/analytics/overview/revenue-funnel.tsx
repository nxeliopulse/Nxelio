import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { FunnelStage } from "@/lib/queries/analytics-overview";
import { formatNumber } from "@/components/analytics/overview/kpi-card";

// Doc §7 wants every stage individually clickable through to its own
// detailed report. None of those per-stage reports exist yet (Phase 2+), so
// each stage links to the closest existing page instead — same approach as
// the Quick Reports panel.
const STAGE_HREF: Record<string, string> = {
  prospects_added: "/leads",
  enriched: "/leads",
  ai_scored: "/leads",
  contacted: "/leads",
  replied: "/activities/emails",
  meetings_booked: "/meetings",
  qualified: "/leads",
  opportunities_created: "/opportunities",
  closed_won: "/opportunities",
};

/** A generic clickable funnel — originally the Nurture-to-Revenue Funnel
 *  (doc §7), reused as-is for the Segment Funnel and any later funnel-shaped
 *  visualization, since the shape (key/label/count/conversionPercent) is
 *  the same everywhere. Bespoke, not built on the Explorer's FunnelWidget,
 *  since that widget doesn't support per-stage drill-down links. */
export function RevenueFunnel({
  stages,
  title = "Nurture-to-Revenue Funnel",
  stageHref = STAGE_HREF,
}: {
  stages: FunnelStage[] | { key: string; label: string; count: number; conversionPercent: number }[];
  title?: string;
  stageHref?: Record<string, string>;
}) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  return (
    <Card className="p-5 h-full">
      <CardHeader className="p-0 border-0 mb-4">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <div className="space-y-2">
        {stages.map((stage, i) => {
          const widthPct = Math.max((stage.count / max) * 100, 4);
          return (
            <Link
              key={stage.key}
              href={stageHref[stage.key] ?? "/leads"}
              className="flex items-center gap-3 group py-1 rounded-lg hover:bg-slate-50 px-1.5 -mx-1.5"
              title={`${stage.label}: ${formatNumber(stage.count)}${i > 0 ? ` (${stage.conversionPercent}% of previous stage)` : ""}`}
            >
              <span className="text-xs font-semibold text-slate-500 w-36 flex-shrink-0 truncate">{stage.label}</span>
              <div className="flex-1 h-6 bg-slate-100 rounded-md overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-md flex items-center justify-end px-2 transition-all group-hover:from-sky-600 group-hover:to-blue-600"
                  style={{ width: `${widthPct}%` }}
                >
                  <span className="text-[11px] font-bold text-white">{formatNumber(stage.count)}</span>
                </div>
              </div>
              <span className="text-xs font-bold text-slate-400 w-12 text-right flex-shrink-0">{i === 0 ? "" : `${stage.conversionPercent}%`}</span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
