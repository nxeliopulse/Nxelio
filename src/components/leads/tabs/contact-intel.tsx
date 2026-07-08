"use client";
import { useState } from "react";
import { Mail, Globe, Phone, Star, Users, Sparkles, Loader2, AlertCircle, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { generateContactIntel, type AiContact } from "@/lib/ai/actions";

export function ContactIntelTab({ leadId }: { leadId: string }) {
  const [contacts, setContacts] = useState<AiContact[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setContacts(await generateContactIntel(leadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  if (!contacts) {
    return (
      <Card className="p-8 text-center">
        <div className="h-12 w-12 mx-auto rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center mb-4">
          <Users className="h-6 w-6 text-white" />
        </div>
        <h3 className="font-semibold text-slate-900 mb-1">Contact Intelligence</h3>
        <p className="text-sm text-slate-500 mb-5 max-w-md mx-auto">
          Let AI suggest the key decision-maker roles to target and how to engage each one.
        </p>
        {error && <div className="flex items-center justify-center gap-2 text-sm text-red-600 mb-4"><AlertCircle className="h-4 w-4" /> {error}</div>}
        <Button onClick={run} disabled={loading}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Finding contacts...</> : <><Sparkles className="h-4 w-4" /> Suggest Contacts</>}
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex-1">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          AI-suggested roles — connect a data provider (Apollo, Hunter) for verified contacts.
        </div>
        <Button variant="outline" size="sm" onClick={run} disabled={loading} className="ml-3">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Re-run"}</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {contacts.map((c, i) => (
          <Card key={i} className="p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-3 mb-3">
              <div className="h-11 w-11 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                {c.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                  {c.priority === "Primary" ? (
                    <Badge variant="danger"><Star className="h-2.5 w-2.5" /> Primary</Badge>
                  ) : (
                    <Badge variant="default">Secondary</Badge>
                  )}
                </div>
                <p className="text-sm text-slate-500">{c.role}</p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">AI Insight</p>
                <p className="text-slate-700">{c.insight}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-1">Engagement Strategy</p>
                <p className="text-slate-700">{c.strategy}</p>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {c.confidence}% confidence
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" title="Email"><Mail className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" title="LinkedIn"><Globe className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" title="Call"><Phone className="h-4 w-4" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
