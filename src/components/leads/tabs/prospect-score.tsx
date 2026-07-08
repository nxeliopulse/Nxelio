"use client";
import { useState } from "react";
import { Sparkles, TrendingUp, Users, ShieldCheck, Loader2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { scoreLeadWithAi, type AiScoreResult } from "@/lib/ai/actions";

const dimMeta = [
  { key: "companyFit", label: "Company Fit", icon: <ShieldCheck className="h-4 w-4" />, color: "bg-emerald-500", desc: "Industry, size, and tech stack match your ICP" },
  { key: "contactAccess", label: "Contact Access", icon: <Users className="h-4 w-4" />, color: "bg-blue-500", desc: "Reachability of key decision-makers" },
  { key: "opportunityQuality", label: "Opportunity Quality", icon: <TrendingUp className="h-4 w-4" />, color: "bg-purple-500", desc: "Strength of buying signals" },
  { key: "competitivePosition", label: "Competitive Position", icon: <Sparkles className="h-4 w-4" />, color: "bg-amber-500", desc: "Position vs. competing solutions" },
] as const;

export function ProspectScoreTab({ leadId }: { leadId: string }) {
  const [result, setResult] = useState<AiScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runScore() {
    setLoading(true);
    setError(null);
    try {
      const r = await scoreLeadWithAi(leadId);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI scoring failed");
    } finally {
      setLoading(false);
    }
  }

  if (!result) {
    return (
      <Card className="p-8 text-center">
        <div className="h-12 w-12 mx-auto rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center mb-4">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <h3 className="font-semibold text-slate-900 mb-1">AI Prospect Scoring</h3>
        <p className="text-sm text-slate-500 mb-5 max-w-md mx-auto">
          Let AI analyze this lead across company fit, contact access, opportunity quality, and competitive position.
        </p>
        {error && (
          <div className="flex items-center justify-center gap-2 text-sm text-red-600 mb-4">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}
        <Button onClick={runScore} disabled={loading}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing with AI...</> : <><Sparkles className="h-4 w-4" /> Generate AI Score</>}
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-slate-900">AI Prospect Score Breakdown</h3>
            <p className="text-sm text-slate-500 mt-0.5">Overall: <span className="font-bold text-slate-900">{result.overallScore}/100</span></p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="purple"><Sparkles className="h-3 w-3" /> AI Generated</Badge>
            <Button variant="outline" size="sm" onClick={runScore} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Re-run"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dimMeta.map((d) => {
            const value = result.dimensions[d.key];
            return (
              <div key={d.key} className="p-4 border border-slate-100 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`h-7 w-7 rounded-md text-white flex items-center justify-center ${d.color}`}>{d.icon}</div>
                    <span className="font-medium text-slate-900">{d.label}</span>
                  </div>
                  <span className="font-bold text-slate-900">{value}<span className="text-sm text-slate-400">/100</span></span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                  <div className={`h-full rounded-full ${d.color}`} style={{ width: `${value}%` }} />
                </div>
                <p className="text-xs text-slate-500">{d.desc}</p>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900 mb-2">AI Insights</h3>
            <p className="text-sm text-slate-700 leading-relaxed mb-3">{result.insight}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Outreach Readiness</p>
                <span className={`font-bold ${result.outreachReadiness === "High" ? "text-emerald-600" : result.outreachReadiness === "Medium" ? "text-amber-600" : "text-slate-600"}`}>
                  {result.outreachReadiness}
                </span>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Expected Sales Cycle</p>
                <span className="font-bold text-slate-900">{result.expectedSalesCycle}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {result.nextSteps?.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold text-slate-900 mb-3">AI-Recommended Next Steps</h3>
          <ul className="space-y-2">
            {result.nextSteps.map((s, i) => (
              <li key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-3">
                  <Badge variant={s.priority === "Now" ? "danger" : s.priority === "Watch" ? "default" : "warning"}>{s.priority}</Badge>
                  <span className="text-sm text-slate-700">{s.action}</span>
                </div>
                <span className="text-xs text-slate-500">Impact: <strong className="text-slate-700">{s.impact}</strong></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
