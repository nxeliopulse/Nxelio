"use client";
import { useState } from "react";
import { Target, Sparkles, ChevronRight, Loader2, AlertCircle, Mail, Users, Eye, MessageSquare, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { generateNextSteps, type AiNextStepsResult } from "@/lib/ai/actions";

const priorityColor: Record<string, string> = {
  Now: "bg-red-500",
  "This week": "bg-amber-500",
  "Next 2 weeks": "bg-blue-500",
  Watch: "bg-slate-400",
};

const stepIcons = [<Mail key="0" className="h-4 w-4" />, <Users key="1" className="h-4 w-4" />, <Eye key="2" className="h-4 w-4" />, <MessageSquare key="3" className="h-4 w-4" />, <TrendingUp key="4" className="h-4 w-4" />];

export function NextStepsTab({ leadId }: { leadId: string }) {
  const [data, setData] = useState<AiNextStepsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setData(await generateNextSteps(leadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  if (!data) {
    return (
      <Card className="p-8 text-center">
        <div className="h-12 w-12 mx-auto rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-4">
          <Target className="h-6 w-6 text-white" />
        </div>
        <h3 className="font-semibold text-slate-900 mb-1">AI Next Steps</h3>
        <p className="text-sm text-slate-500 mb-5 max-w-md mx-auto">
          Get prioritized, specific recommended actions plus timing and deal-size estimates.
        </p>
        {error && <div className="flex items-center justify-center gap-2 text-sm text-red-600 mb-4"><AlertCircle className="h-4 w-4" /> {error}</div>}
        <Button onClick={run} disabled={loading}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Planning...</> : <><Sparkles className="h-4 w-4" /> Generate Next Steps</>}
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0">
              <Target className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">AI-Recommended Actions</h3>
              <p className="text-sm text-slate-700 mt-0.5">Prioritized by impact and timing.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={run} disabled={loading}>{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Re-run"}</Button>
        </div>
      </Card>

      <Card>
        <div className="p-5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Recommended Actions</h3>
        </div>
        <ul className="divide-y divide-slate-100">
          {data.steps.map((r, i) => (
            <li key={i} className="p-5 hover:bg-slate-50 transition-colors flex items-start gap-4 group cursor-pointer">
              <div className={`h-9 w-9 rounded-lg ${priorityColor[r.priority] || "bg-slate-400"} text-white flex items-center justify-center flex-shrink-0`}>
                {stepIcons[i % stepIcons.length]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant={r.priority === "Now" ? "danger" : r.priority === "Watch" ? "default" : "warning"}>{r.priority}</Badge>
                  <span className="text-xs text-slate-500">Impact: <strong className="text-slate-700">{r.impact}</strong></span>
                </div>
                <p className="font-semibold text-slate-900">{r.title}</p>
                <p className="text-sm text-slate-500 mt-1">{r.description}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 flex-shrink-0" />
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold text-slate-900 mb-4">Timing & Sales Cycle Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: "Decision timeline", value: data.decisionTimeline },
            { label: "Best contact window", value: data.bestContactWindow },
            { label: "Likely deal size", value: data.likelyDealSize },
          ].map((t) => (
            <div key={t.label} className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">{t.label}</p>
              <p className="font-semibold text-slate-900">{t.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
