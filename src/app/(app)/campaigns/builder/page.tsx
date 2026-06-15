"use client";
import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Save, Send, Sparkles, Mail, Plus, Clock, RefreshCw, AlertCircle,
  Loader2, Users2, Layers3, Trash2, Filter, LayoutTemplate, Wand2, CheckCircle2, Eye,
} from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useFeedback } from "@/components/ui/feedback";
import { createCampaign } from "@/lib/queries/campaigns";
import { getSegments } from "@/lib/queries/segments";
import { generateEmailSequence, type GeneratedEmail } from "@/lib/ai/actions";
import { campaignTemplates, getCampaignTemplate, TEMPLATE_CATEGORIES } from "@/lib/campaign-templates";
import { AddLeadsWizard } from "@/components/leads/add-leads-wizard";
import { SequenceFlow, MiniSequencePreview } from "@/components/campaigns/sequence-flow";

type Step = 1 | 2 | 3;
interface LeadList { id: string; label: string; source: string; count: number; segmentId: string | null }
interface SegmentLite { id: string; segment_name: string; contacts: number }

const TABS: { n: Step; label: string }[] = [
  { n: 1, label: "Add Leads" },
  { n: 2, label: "Create a Sequence" },
  { n: 3, label: "Settings" },
];

export default function CampaignBuilderPage() {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("Untitled Campaign");
  const [error, setError] = useState<string | null>(null);

  // Step 1 — audience lists
  const [segments, setSegments] = useState<SegmentLite[]>([]);
  const [lists, setLists] = useState<LeadList[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Step 2 — sequence
  const [tplTab, setTplTab] = useState<"prebuilt" | "custom">("prebuilt");
  const [chosenTpl, setChosenTpl] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<string>("All");
  const [channelFilter, setChannelFilter] = useState<string>("All channels");
  const [sequence, setSequence] = useState<GeneratedEmail[]>([]);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  // Step 3 — settings
  const [schedule, setSchedule] = useState("Send immediately");

  useEffect(() => {
    getSegments().then((s) => setSegments(s.map((x) => ({ id: x.id, segment_name: x.segment_name, contacts: x.contacts })))).catch(() => {});
    // Deep-link: ?template=<id> jumps straight into a pre-built sequence
    const id = new URLSearchParams(window.location.search).get("template");
    const tpl = getCampaignTemplate(id);
    if (tpl) {
      setName(tpl.name);
      setPrompt(tpl.goal);
      setChosenTpl(tpl.id);
      setSequence(tpl.steps.map((s) => ({ day: s.day, subject: s.subject, body: s.body })));
    }
  }, []);

  function addList(segmentId: string | null) {
    setAddOpen(false);
    if (segmentId === null) {
      if (lists.some((l) => l.segmentId === null)) return;
      setLists([...lists, { id: `all-${Date.now()}`, label: "All leads", source: "Workspace", count: 0, segmentId: null }]);
    } else {
      const seg = segments.find((s) => s.id === segmentId);
      if (!seg || lists.some((l) => l.segmentId === segmentId)) return;
      setLists([...lists, { id: `seg-${segmentId}`, label: seg.segment_name, source: "Segment", count: seg.contacts, segmentId }]);
    }
  }

  function pickTemplate(id: string) {
    const tpl = getCampaignTemplate(id);
    if (!tpl) return;
    setChosenTpl(id);
    setPrompt(tpl.goal);
    setSequence(tpl.steps.map((s) => ({ day: s.day, subject: s.subject, body: s.body })));
    if (name === "Untitled Campaign") setName(tpl.name);
  }

  function startCustom() {
    setChosenTpl("custom");
    setSequence([{ day: "Day 1", subject: "", body: "" }]);
  }

  async function handleGenerate() {
    if (!prompt.trim()) { setError("Describe your campaign goal first"); return; }
    setError(null);
    setGenerating(true);
    try {
      const emails = await generateEmailSequence(prompt.trim());
      if (emails.length) setSequence(emails);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function next() {
    setError(null);
    if (step === 1 && lists.length === 0) { setError("Add at least one list of leads to continue."); return; }
    if (step === 2 && (!chosenTpl || sequence.length === 0)) { setError("Pick a template or build a sequence first."); return; }
    setStep((s) => (Math.min(3, s + 1) as Step));
  }
  function back() { setStep((s) => (Math.max(1, s - 1) as Step)); }

  function save(status: "Draft" | "Active") {
    setError(null);
    if (!name.trim()) { setError("Campaign name required"); return; }
    const segmentId = lists.find((l) => l.segmentId)?.segmentId ?? null;
    start(async () => {
      try {
        await createCampaign({
          campaign_name: name.trim(),
          status,
          campaign_type: "Email Sequence",
          segment_id: segmentId,
          subject: sequence[0]?.subject || null,
          content: sequence.map((s) => `${s.day} — ${s.subject}\n${s.body}`).join("\n\n---\n\n").slice(0, 5000),
        });
        toast(status === "Active" ? "Campaign launched" : "Draft saved", "success");
        router.push("/campaigns");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3">
        <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to campaigns
        </Link>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-[280px] font-medium"
        />
      </div>

      {/* Tab header — Add Leads · Create a Sequence · Settings */}
      <div className="flex border-b border-slate-200 mb-6">
        {TABS.map((t) => {
          const done = t.n < step;
          const activeTab = t.n === step;
          return (
            <button
              key={t.n}
              onClick={() => { if (t.n < step) setStep(t.n); }}
              className={`relative flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors ${
                activeTab ? "text-blue-600" : done ? "text-slate-700 hover:text-slate-900" : "text-slate-400 cursor-default"
              }`}
            >
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] ${
                activeTab ? "bg-blue-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
              }`}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : t.n}
              </span>
              {t.label}
              {activeTab && <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-blue-600 rounded-full" />}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
        </div>
      )}

      {/* STEP 1 — Add Leads */}
      {step === 1 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Lists of leads</h2>
              <p className="text-sm text-slate-500">Choose who this campaign reaches.</p>
            </div>
            <div className="relative">
              <Button onClick={() => setAddOpen((v) => !v)}><Plus className="h-4 w-4" /> Add a new list</Button>
              {addOpen && (
                <div className="lp-anim-pop origin-top-right absolute right-0 top-full mt-1 z-20 w-64 bg-white rounded-xl border border-slate-200 shadow-lg p-1">
                  <button onClick={() => addList(null)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                    <Users2 className="h-4 w-4 text-slate-400" /> All leads
                  </button>
                  {segments.length > 0 && <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Segments</p>}
                  {segments.map((s) => (
                    <button key={s.id} onClick={() => addList(s.id)} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                      <span className="flex items-center gap-2 min-w-0"><Layers3 className="h-4 w-4 text-slate-400 flex-shrink-0" /> <span className="truncate">{s.segment_name}</span></span>
                      <span className="text-xs text-slate-400">{s.contacts}</span>
                    </button>
                  ))}
                  <button onClick={() => { setAddOpen(false); setShowImport(true); }} className="w-full flex items-center gap-2 px-3 py-2 mt-1 border-t border-slate-100 rounded-lg text-sm font-medium text-blue-600 hover:bg-slate-50">
                    <Plus className="h-4 w-4" /> Import new leads…
                  </button>
                </div>
              )}
            </div>
          </div>

          {lists.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="h-12 w-12 mx-auto rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3"><Users2 className="h-6 w-6" /></div>
              <p className="font-medium text-slate-900">Add leads to this campaign</p>
              <p className="text-sm text-slate-500 mt-1">Pick a segment, all leads, or import a new list.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {lists.map((l) => (
                <Card key={l.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      {l.segmentId ? <Layers3 className="h-4.5 w-4.5" /> : <Users2 className="h-4.5 w-4.5" />}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{l.label}</p>
                      <p className="text-xs text-slate-500">Added from {l.source}{l.segmentId ? ` · ${l.count} leads` : ""}</p>
                    </div>
                  </div>
                  <button onClick={() => setLists(lists.filter((x) => x.id !== l.id))} aria-label="Remove list" className="p-2 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2 — Create a Sequence */}
      {step === 2 && (
        <div>
          {!chosenTpl ? (
            <>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 className="text-xl font-bold text-slate-900">Sequence templates</h2>
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                  {([["prebuilt", "Pre-built"], ["custom", "Custom"]] as const).map(([v, label]) => (
                    <button key={v} onClick={() => { setTplTab(v); if (v === "custom") startCustom(); }}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tplTab === v ? "bg-white shadow-sm text-slate-900 font-medium" : "text-slate-500 hover:text-slate-700"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category + channel filters */}
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <button key={c} onClick={() => setCatFilter(c)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${catFilter === c ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                      {c}
                    </button>
                  ))}
                </div>
                <Select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} className="max-w-[170px]">
                  <option>All channels</option>
                  <option>Email</option>
                  <option>LinkedIn</option>
                </Select>
              </div>

              {(() => {
                const visible = campaignTemplates.filter((t) =>
                  (catFilter === "All" || t.category === catFilter) &&
                  (channelFilter === "All channels" || t.channels.includes(channelFilter as never))
                );
                if (visible.length === 0) return <Card className="p-12 text-center text-sm text-slate-500">No templates match these filters.</Card>;
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visible.map((t) => {
                      const Icon = t.icon;
                      return (
                        <button key={t.id} onClick={() => setPreviewId(t.id)}
                          className="group relative text-left bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-blue-300 hover:shadow-md transition-all">
                          <div className="relative h-32 bg-slate-50 border-b border-slate-100 p-3 flex items-center justify-center overflow-hidden">
                            <MiniSequencePreview steps={t.steps.length} />
                            <span className="absolute inset-0 flex items-center justify-center group-hover:bg-blue-600/5 transition-colors">
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                                <Eye className="h-3.5 w-3.5" /> Preview
                              </span>
                            </span>
                          </div>
                          <div className="p-3">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              {t.channels.map((ch) => (
                                <span key={ch} className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${ch === "Email" ? "text-blue-700 bg-blue-50" : "text-indigo-700 bg-indigo-50"}`}>{ch}</span>
                              ))}
                              <span className="text-[11px] text-slate-400 ml-auto">{t.steps.length} steps</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${t.accent}`}><Icon className="h-3.5 w-3.5" /></span>
                              <p className="font-semibold text-slate-900 text-sm group-hover:text-blue-700 truncate">{t.name}</p>
                            </div>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => { setChosenTpl(null); setTplTab("prebuilt"); }} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
                    <LayoutTemplate className="h-4 w-4" /> Change template
                  </button>
                </div>
                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
                  {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} AI rewrite
                </Button>
              </div>

              {/* Vertical flow */}
              <div className="relative pl-4">
                <div className="absolute left-[27px] top-2 bottom-10 w-px bg-slate-200" />
                <div className="space-y-3">
                  {sequence.map((s, i) => (
                    <div key={i}>
                      {i > 0 && (
                        <div className="flex items-center gap-2 pl-1 mb-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-500 text-xs px-2.5 py-1"><Clock className="h-3 w-3" /> {s.day}</span>
                        </div>
                      )}
                      <Card className="p-4 ml-0">
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-semibold relative z-10"><Mail className="h-4 w-4" /></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-slate-500">Step {i + 1} · {s.day}</span>
                              {sequence.length > 1 && (
                                <button onClick={() => setSequence(sequence.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                              )}
                            </div>
                            <Input value={s.subject} onChange={(e) => setSequence(sequence.map((x, j) => j === i ? { ...x, subject: e.target.value } : x))} placeholder="Subject line" className="font-medium mb-2 bg-slate-50" />
                            <Textarea value={s.body} onChange={(e) => setSequence(sequence.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} rows={3} placeholder="Email body…" className="bg-slate-50 text-sm" />
                          </div>
                        </div>
                      </Card>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="ml-0 mt-3" onClick={() => setSequence([...sequence, { day: `Day ${sequence.length * 3}`, subject: "", body: "" }])}>
                  <Plus className="h-4 w-4" /> Add step
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 3 — Settings */}
      {step === 3 && (
        <div className="max-w-xl space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Settings</h2>
          <Card className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Campaign name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Audience</label>
              <p className="text-sm text-slate-600">{lists.map((l) => l.label).join(", ") || "—"}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Send schedule</label>
              <Select value={schedule} onChange={(e) => setSchedule(e.target.value)}>
                <option>Send immediately</option>
                <option>Schedule for later</option>
                <option>Drip over time</option>
              </Select>
            </div>
            <div className="text-sm text-slate-500 flex items-center gap-2 bg-slate-50 rounded-lg p-3">
              <Filter className="h-4 w-4 flex-shrink-0" /> Leads who reply are automatically put on hold — no further steps are sent.
            </div>
          </Card>
        </div>
      )}

      {/* Footer nav */}
      <div className="mt-6 flex items-center justify-between">
        {step > 1 ? (
          <Button variant="outline" onClick={back}><ArrowLeft className="h-4 w-4" /> Back</Button>
        ) : <span />}
        {step < 3 ? (
          <Button onClick={next}>Next <ArrowRight className="h-4 w-4" /></Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => save("Draft")} disabled={pending}><Save className="h-4 w-4" /> Save draft</Button>
            <Button onClick={() => save("Active")} disabled={pending}>
              {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Launching…</> : <><Send className="h-4 w-4" /> Launch</>}
            </Button>
          </div>
        )}
      </div>

      <AddLeadsWizard open={showImport} onClose={() => setShowImport(false)} />

      {/* Template preview — visual workflow flow + Select */}
      <Modal
        open={previewId !== null}
        onClose={() => setPreviewId(null)}
        title={getCampaignTemplate(previewId)?.name}
        description={getCampaignTemplate(previewId)?.description}
        size="lg"
      >
        <div className="p-5 bg-slate-50/60 max-h-[55vh] overflow-y-auto">
          {previewId && <SequenceFlow steps={getCampaignTemplate(previewId)!.steps} />}
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPreviewId(null)}>Cancel</Button>
          <Button onClick={() => { if (previewId) pickTemplate(previewId); setPreviewId(null); }}>
            <CheckCircle2 className="h-4 w-4" /> Select template
          </Button>
        </div>
      </Modal>
    </div>
  );
}
