"use client";
import { useState } from "react";
import { Sparkles, Edit3, Mail, RefreshCw, Clock, Loader2, AlertCircle, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { generateLeadOutreach, type GeneratedEmail } from "@/lib/ai/actions";

const colors = ["bg-blue-500", "bg-purple-500", "bg-emerald-500", "bg-amber-500", "bg-pink-500"];

export function OutreachTab({ leadId }: { leadId: string }) {
  const [emails, setEmails] = useState<GeneratedEmail[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setEmails(await generateLeadOutreach(leadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  if (!emails) {
    return (
      <Card className="p-8 text-center">
        <div className="h-12 w-12 mx-auto rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center mb-4">
          <Send className="h-6 w-6 text-white" />
        </div>
        <h3 className="font-semibold text-slate-900 mb-1">AI Outreach Sequence</h3>
        <p className="text-sm text-slate-500 mb-5 max-w-md mx-auto">
          Generate a personalized multi-step email sequence tailored to this specific lead.
        </p>
        {error && <div className="flex items-center justify-center gap-2 text-sm text-red-600 mb-4"><AlertCircle className="h-4 w-4" /> {error}</div>}
        <Button onClick={run} disabled={loading}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Writing sequence...</> : <><Sparkles className="h-4 w-4" /> Generate Sequence</>}
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 bg-gradient-to-br from-purple-50 to-pink-50 border-purple-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">AI-Generated Outreach Sequence</h3>
              <p className="text-sm text-slate-600 mt-0.5">Personalized to this lead&apos;s company and interests.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Regenerate
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        {emails.map((s, i) => (
          <Card key={i} className="p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center gap-1 flex-shrink-0 w-20">
                <div className={`h-10 w-10 rounded-full ${colors[i % colors.length]} text-white flex items-center justify-center`}>
                  <Mail className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 mt-1"><Clock className="h-3 w-3" /> {s.day}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-end mb-2">
                  <Badge variant="purple"><Sparkles className="h-2.5 w-2.5" /> AI</Badge>
                </div>
                <Input
                  value={s.subject}
                  onChange={(e) => setEmails(emails.map((x, j) => j === i ? { ...x, subject: e.target.value } : x))}
                  className="font-semibold mb-2 bg-slate-50"
                />
                <Textarea
                  value={s.body}
                  onChange={(e) => setEmails(emails.map((x, j) => j === i ? { ...x, body: e.target.value } : x))}
                  rows={3}
                  className="bg-slate-50 text-sm"
                />
                <div className="flex items-center gap-2 mt-3">
                  <Button variant="outline" size="sm"><Edit3 className="h-3.5 w-3.5" /> Edit</Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-end pt-2">
        <Button><Mail className="h-4 w-4" /> Launch sequence</Button>
      </div>
    </div>
  );
}
