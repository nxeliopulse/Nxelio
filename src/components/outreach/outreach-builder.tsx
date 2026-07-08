"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Save, Send, Sparkles, Mail, Clock, Plus, Trash2,
  AlertCircle, Loader2, UserPlus, MessageSquare, Eye,
} from "lucide-react";
import { Linkedin } from "@/components/outreach/linkedin-icon";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createSequence, updateSequence, saveSequenceSteps,
  type OutreachSequenceRow, type OutreachStepRow, type StepChannel, type StepAction, type DelayUnit,
} from "@/lib/queries/outreach";
import { generateOutreachSequence } from "@/lib/outreach/actions";

interface EditableStep {
  key: string;
  channel: StepChannel;
  action: StepAction;
  delay_days: number;        // delay VALUE
  delay_unit: DelayUnit;     // minutes | hours | days
  subject: string;
  body: string;
}

const DELAY_UNITS: DelayUnit[] = ["minutes", "hours", "days"];

let keySeq = 0;
const nextKey = () => `s${keySeq++}`;

const LINKEDIN_ACTIONS: { value: StepAction; label: string }[] = [
  { value: "connection_request", label: "Connection request" },
  { value: "linkedin_message", label: "Message" },
  { value: "profile_view", label: "Profile view" },
];

function fromRows(rows: OutreachStepRow[]): EditableStep[] {
  return rows.map((r) => ({
    key: nextKey(),
    channel: r.channel,
    action: r.action,
    delay_days: r.delay_days,
    delay_unit: r.delay_unit || "days",
    subject: r.subject || "",
    body: r.body || "",
  }));
}

const DEFAULT_STEPS: EditableStep[] = [
  { key: nextKey(), channel: "linkedin", action: "connection_request", delay_days: 0, delay_unit: "days", subject: "", body: "Hi {{firstName}}, I work with {{industry}} teams and would love to connect." },
  { key: nextKey(), channel: "linkedin", action: "linkedin_message", delay_days: 2, delay_unit: "days", subject: "", body: "Thanks for connecting, {{firstName}}! Curious how {{companyName}} is handling lead nurturing right now?" },
  { key: nextKey(), channel: "email", action: "email", delay_days: 4, delay_unit: "days", subject: "Quick idea for {{companyName}}", body: "Hi {{firstName}}, following up from LinkedIn — we help {{industry}} teams cut prospecting time by 60%. Worth a quick chat?" },
];

export function OutreachBuilder({ initialSequence, initialSteps }: {
  initialSequence: OutreachSequenceRow | null;
  initialSteps: OutreachStepRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initialSequence?.name || "Untitled Sequence");
  const [steps, setSteps] = useState<EditableStep[]>(
    initialSteps.length ? fromRows(initialSteps) : DEFAULT_STEPS
  );
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(key: string, patch: Partial<EditableStep>) {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }
  function remove(key: string) {
    setSteps((prev) => prev.filter((s) => s.key !== key));
  }
  function addEmail() {
    setSteps((prev) => [...prev, { key: nextKey(), channel: "email", action: "email", delay_days: prev.length ? 3 : 0, delay_unit: "days", subject: "", body: "" }]);
  }
  function addLinkedIn() {
    setSteps((prev) => [...prev, { key: nextKey(), channel: "linkedin", action: prev.length ? "linkedin_message" : "connection_request", delay_days: prev.length ? 2 : 0, delay_unit: "days", subject: "", body: "" }]);
  }
  function changeChannel(key: string, channel: StepChannel) {
    update(key, { channel, action: channel === "email" ? "email" : "connection_request" });
  }

  async function handleGenerate() {
    if (!prompt.trim()) { setError("Describe your outreach goal first"); return; }
    setError(null);
    setGenerating(true);
    try {
      const generated = await generateOutreachSequence(prompt.trim());
      if (generated.length) {
        setSteps(generated.map((g) => ({
          key: nextKey(),
          channel: g.channel,
          action: g.action,
          delay_days: g.delay_days,
          delay_unit: "days" as DelayUnit,
          subject: g.subject || "",
          body: g.body || "",
        })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function handleSave(status: "Draft" | "Active") {
    setError(null);
    if (!name.trim()) { setError("Sequence name required"); return; }
    if (!steps.length) { setError("Add at least one step"); return; }
    const stepInputs = steps.map((s) => ({
      channel: s.channel,
      action: s.action,
      delay_days: Number(s.delay_days) || 0,
      delay_unit: s.delay_unit,
      subject: s.channel === "email" ? s.subject : null,
      body: s.body,
    }));
    start(async () => {
      try {
        let id = initialSequence?.id;
        if (id) {
          await updateSequence(id, { name: name.trim(), status });
        } else {
          const created = await createSequence({ name: name.trim(), status });
          id = created.id;
        }
        await saveSequenceSteps(id, stepInputs);
        router.push("/outreach");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  const channels = new Set(steps.map((s) => s.channel));
  const channelLabel = channels.size > 1 ? "Multi-channel" : channels.has("linkedin") ? "LinkedIn only" : "Email only";

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <Link href="/outreach" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to outreach
          </Link>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-2xl font-bold border-transparent !h-auto px-0 hover:bg-slate-50 focus:bg-white focus:px-3 transition-all min-w-[300px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleSave("Draft")} disabled={pending}><Save className="h-4 w-4" /> Save draft</Button>
          <Button onClick={() => handleSave("Active")} disabled={pending}><Send className="h-4 w-4" /> {pending ? "Saving..." : "Save & activate"}</Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* Left: AI + summary */}
        <div className="space-y-4">
          <Card className="p-5 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 border-purple-100">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <h3 className="font-semibold text-slate-900">AI Sequence Generator</h3>
            </div>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your goal... e.g. 'Book demos with SAP consulting firms — connect on LinkedIn first, then follow up by email.'"
              rows={4}
              className="bg-white border-slate-200"
            />
            <Button type="button" className="w-full mt-3" onClick={handleGenerate} disabled={generating}>
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><Sparkles className="h-4 w-4" /> Generate multi-channel sequence</>}
            </Button>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span className="text-slate-500">Type</span><Badge variant="info">{channelLabel}</Badge></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Steps</span><span className="font-medium text-slate-900">{steps.length}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Schedule</span><span className="font-medium text-slate-900">{steps.map((s, i) => i === 0 ? "now" : `+${s.delay_days}${s.delay_unit[0]}`).join(" → ")}</span></div>
            </div>
            <p className="text-xs text-slate-400 mt-4 leading-relaxed">
              Use merge tags like <code>{"{{firstName}}"}</code>, <code>{"{{companyName}}"}</code> and <code>{"{{industry}}"}</code> — they&apos;re filled per lead at send time.
            </p>
          </Card>
        </div>

        {/* Right: steps */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Sequence steps</h3>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={addLinkedIn}><Linkedin className="h-3.5 w-3.5" /> LinkedIn step</Button>
              <Button variant="outline" size="sm" onClick={addEmail}><Mail className="h-3.5 w-3.5" /> Email step</Button>
            </div>
          </div>

          <div className="space-y-3">
            {steps.length === 0 && (
              <Card className="p-8 text-center text-sm text-slate-500">No steps yet. Add a LinkedIn or Email step, or generate with AI.</Card>
            )}
            {steps.map((s, i) => {
              const isEmail = s.channel === "email";
              const Icon = isEmail ? Mail : s.action === "profile_view" ? Eye : s.action === "linkedin_message" ? MessageSquare : Linkedin;
              return (
                <Card key={s.key} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 pt-1">
                      <span className="text-[10px] font-bold text-slate-400">{i + 1}</span>
                      <div className={`h-9 w-9 rounded-full ${isEmail ? "bg-blue-500" : "bg-cyan-500"} text-white flex items-center justify-center`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      {i < steps.length - 1 && <div className="w-px flex-1 min-h-[12px] bg-slate-200 mt-1" />}
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Select value={s.channel} onChange={(e) => changeChannel(s.key, e.target.value as StepChannel)} className="!h-8 !w-auto text-xs">
                          <option value="linkedin">LinkedIn</option>
                          <option value="email">Email</option>
                        </Select>
                        {!isEmail && (
                          <Select value={s.action} onChange={(e) => update(s.key, { action: e.target.value as StepAction })} className="!h-8 !w-auto text-xs">
                            {LINKEDIN_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                          </Select>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="h-3 w-3" />
                          {i === 0 ? "Immediately" : (
                            <>wait
                              <input
                                type="number" min={0} value={s.delay_days}
                                onChange={(e) => update(s.key, { delay_days: Math.max(0, Number(e.target.value)) })}
                                className="w-14 h-7 rounded border border-slate-200 px-1.5 text-center text-xs"
                              />
                              <select
                                value={s.delay_unit}
                                onChange={(e) => update(s.key, { delay_unit: e.target.value as DelayUnit })}
                                className="h-7 rounded border border-slate-200 px-1 text-xs bg-white"
                              >
                                {DELAY_UNITS.map((u) => (
                                  <option key={u} value={u}>{u}</option>
                                ))}
                              </select>
                            </>
                          )}
                        </span>
                        <button onClick={() => remove(s.key)} className="ml-auto p-1.5 rounded-md hover:bg-red-50 text-red-500" title="Remove step">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {isEmail && (
                        <Input
                          value={s.subject}
                          onChange={(e) => update(s.key, { subject: e.target.value })}
                          placeholder="Subject line"
                          className="font-medium bg-slate-50"
                        />
                      )}
                      {s.action === "profile_view" ? (
                        <p className="text-xs text-slate-400 italic">Visits the lead&apos;s LinkedIn profile — a soft touch with no message.</p>
                      ) : (
                        <Textarea
                          value={s.body}
                          onChange={(e) => update(s.key, { body: e.target.value })}
                          rows={3}
                          placeholder={isEmail ? "Email body..." : s.action === "connection_request" ? "Connection note (optional)..." : "LinkedIn message..."}
                          className="bg-slate-50 text-sm"
                        />
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}

            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex-1" onClick={addLinkedIn}><Plus className="h-4 w-4" /> Add LinkedIn step</Button>
              <Button variant="outline" className="flex-1" onClick={addEmail}><Plus className="h-4 w-4" /> Add Email step</Button>
            </div>
          </div>

          <Card className="p-4 bg-slate-50 border-dashed flex items-center gap-3">
            <UserPlus className="h-5 w-5 text-slate-400" />
            <p className="text-sm text-slate-500">Save the sequence, then use <strong>Enroll</strong> on the Outreach list to add leads and start sending.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
