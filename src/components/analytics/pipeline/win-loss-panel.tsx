import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/components/analytics/overview/kpi-card";
import type { PipelineAnalyticsData } from "@/lib/queries/analytics-pipeline";

export function WinLossPanel({ winLoss }: { winLoss: PipelineAnalyticsData["winLoss"] }) {
  return (
    <Card className="p-5">
      <CardHeader className="p-0 border-0 mb-3"><CardTitle className="text-sm">Win/Loss Analysis</CardTitle></CardHeader>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div><p className="text-xs text-slate-400">Won Deals</p><p className="text-lg font-black text-slate-900">{formatNumber(winLoss.won)}</p></div>
        <div><p className="text-xs text-slate-400">Lost Deals</p><p className="text-lg font-black text-slate-900">{formatNumber(winLoss.lost)}</p></div>
        <div><p className="text-xs text-slate-400">Avg. Won Value</p><p className="text-lg font-black text-slate-900">{formatCurrency(winLoss.averageWonValue)}</p></div>
        <div><p className="text-xs text-slate-400">Avg. Lost Value</p><p className="text-lg font-black text-slate-900">{formatCurrency(winLoss.averageLostValue)}</p></div>
      </div>

      <p className="text-xs font-semibold text-slate-500 mb-2">Loss Reasons</p>
      {!winLoss.lossReasonsCaptured ? (
        <p className="text-sm text-slate-400 italic">
          Not tracked yet — no lost deal has a reason recorded. Capturing a reason when a deal is marked Lost (a small addition to the Opportunities board) will populate this section.
        </p>
      ) : (
        <div className="space-y-1.5">
          {winLoss.lossReasons.map((r) => (
            <div key={r.reason} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{r.reason}</span>
              <span className="font-bold text-slate-900">{r.count} · {formatCurrency(r.value)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
