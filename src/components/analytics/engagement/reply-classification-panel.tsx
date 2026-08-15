import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReplyClassificationRow } from "@/lib/queries/analytics-engagement";

const COLOR: Record<string, string> = {
  Positive: "bg-emerald-500", "Meeting Request": "bg-sky-500", Neutral: "bg-slate-400",
  Negative: "bg-rose-400", "Not Interested": "bg-rose-500", Unsubscribe: "bg-rose-700", "Out of Office": "bg-amber-400",
};

/** Reply Classification (doc §10) — rule-based heuristic today (see
 *  engagement-metrics.ts's classifyReplyHeuristic); a real AI classifier
 *  with stored confidence + user-correction is a separate feature this
 *  schema doesn't support yet (no reply_classification table). */
export function ReplyClassificationPanel({ rows }: { rows: ReplyClassificationRow[] }) {
  return (
    <Card className="p-4">
      <CardHeader className="p-0 border-0 mb-3">
        <CardTitle className="text-sm">Reply Classification</CardTitle>
        <p className="text-xs text-slate-400 mt-0.5">Rule-based classification — Phase 1</p>
      </CardHeader>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No replies in the selected period.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 w-32 flex-shrink-0 truncate">{r.label}</span>
              <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${COLOR[r.label] || "bg-slate-400"}`} style={{ width: `${r.percent}%` }} />
              </div>
              <span className="text-xs font-bold text-slate-700 w-20 text-right flex-shrink-0">{r.count} ({r.percent}%)</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
