"use client";
import { useState } from "react";
import { Building2, Users, Zap, Sparkles, Loader2, AlertCircle, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { generateCompanyIntel, type AiCompanyIntel } from "@/lib/ai/actions";

export function CompanyIntelTab({ leadId }: { leadId: string }) {
  const [data, setData] = useState<AiCompanyIntel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setData(await generateCompanyIntel(leadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  if (!data) {
    return (
      <Card className="p-8 text-center">
        <div className="h-12 w-12 mx-auto rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center mb-4">
          <Building2 className="h-6 w-6 text-white" />
        </div>
        <h3 className="font-semibold text-slate-900 mb-1">Company Intelligence</h3>
        <p className="text-sm text-slate-500 mb-5 max-w-md mx-auto">
          Generate AI estimates of company profile, growth signals, and strategic positioning.
        </p>
        {error && <div className="flex items-center justify-center gap-2 text-sm text-red-600 mb-4"><AlertCircle className="h-4 w-4" /> {error}</div>}
        <Button onClick={run} disabled={loading}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Researching...</> : <><Sparkles className="h-4 w-4" /> Generate Intelligence</>}
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <Info className="h-3.5 w-3.5 flex-shrink-0" />
        AI-generated estimates — connect an enrichment API for verified firmographics.
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Company Profile</h3>
          <div className="flex items-center gap-2">
            <Badge variant="purple"><Sparkles className="h-3 w-3" /> AI Estimate</Badge>
            <Button variant="outline" size="sm" onClick={run} disabled={loading}>{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Re-run"}</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5"><Building2 className="h-4 w-4" /> Estimated Type</div>
            <p className="font-semibold text-slate-900">{data.estimatedType}</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5"><Users className="h-4 w-4" /> Estimated Size</div>
            <p className="font-semibold text-slate-900">{data.estimatedSize}</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mt-4">{data.summary}</p>
      </Card>

      <Card>
        <div className="p-5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" /> Key Signals
          </h3>
        </div>
        <ul className="divide-y divide-slate-100">
          {data.signals.map((s, i) => (
            <li key={i} className="p-5 flex items-start gap-4">
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{s.title}</p>
                <p className="text-sm text-slate-500 mt-1">{s.description}</p>
              </div>
              <Badge variant={s.level === "Strong" ? "success" : s.level === "Medium" ? "warning" : "default"}>{s.level}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
