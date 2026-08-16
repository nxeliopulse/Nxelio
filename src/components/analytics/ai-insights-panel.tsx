"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles, Check, X } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptRecommendation, dismissRecommendation } from "@/lib/queries/ai-recommendations";

export interface AiInsightLike {
  id: string;
  title: string;
  ctaLabel: string;
  ctaHref: string;
}

/** Shared AI Insights panel used by the 8 analytics pages whose insights
 *  share the {id, title, ctaLabel, ctaHref} shape. Accept/Dismiss persist to
 *  ai_recommendations (migration 0130) — a dismissed insight won't resurface
 *  on this page again, and both actions feed Recommendation Adoption Rate on
 *  AI Performance Analytics. */
export function AiInsightsPanel({ area, insights, heading = "AI Insights" }: { area: string; insights: AiInsightLike[]; heading?: string }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const visible = insights.filter((i) => !hidden.has(i.id));
  if (visible.length === 0) return null;

  function act(id: string, action: "accepted" | "dismissed") {
    setPendingId(id);
    startTransition(async () => {
      try {
        await (action === "accepted" ? acceptRecommendation(area, id) : dismissRecommendation(area, id));
        setHidden((prev) => new Set(prev).add(id));
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <Card className="p-5">
      <CardHeader className="p-0 border-0 mb-3">
        <CardTitle className="text-sm flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-indigo-500" /> {heading}</CardTitle>
      </CardHeader>
      <div className="space-y-2">
        {visible.map((insight) => (
          <div key={insight.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
            <p className="text-sm font-medium text-slate-700">{insight.title}</p>
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <Link href={insight.ctaHref} className="text-xs font-bold text-indigo-600 hover:underline">{insight.ctaLabel}</Link>
              <button
                disabled={pendingId === insight.id}
                onClick={() => act(insight.id, "accepted")}
                title="Accept recommendation"
                className="p-1 text-slate-400 hover:text-emerald-600 disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                disabled={pendingId === insight.id}
                onClick={() => act(insight.id, "dismissed")}
                title="Dismiss"
                className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
