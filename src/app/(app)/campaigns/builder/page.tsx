"use client";
import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Save, Send, Mail, Plus, Clock, AlertCircle,
  Loader2, Users2, Layers3, Trash2, Filter, LayoutTemplate, Wand2, CheckCircle2, Eye, Share2,
  X,
} from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { createCampaign, updateCampaign, type CampaignRow } from "@/lib/queries/campaigns";
import { sendCampaign } from "@/lib/email/campaign-send";
import { getSegments, getSegmentMemberLeads } from "@/lib/queries/segments";
import { getLeads, type LeadRow } from "@/lib/queries/leads";
import { LeadsTable } from "@/components/leads/leads-table";
import { getOutreachAccounts, type OutreachAccountRow } from "@/lib/queries/outreach-accounts";
import { getEmailStatus } from "@/lib/email/actions";
import { generateEmailSequence, type GeneratedEmail } from "@/lib/ai/actions";
import { campaignTemplates, getCampaignTemplate, TEMPLATE_CATEGORIES } from "@/lib/campaign-templates";
import { parseDelay, formatDelay, DELAY_UNITS } from "@/lib/sequence-delay";
import { AddLeadsWizard } from "@/components/leads/add-leads-wizard";
import { SequenceFlow, MiniSequencePreview } from "@/components/campaigns/sequence-flow";

// Analytics and Replies live on the campaign details page, not the builder —
// there's nothing to show for either until the campaign exists and has run.
type TabId = "leads" | "sequence" | "sender" | "settings";
// Ordered to match the intended flow: add leads first, then everything else unlocks.
const PAGE_TABS: { id: TabId; label: string }[] = [
  { id: "leads", label: "Leads" },
  { id: "sequence", label: "Sequence" },
  { id: "sender", label: "Sender accounts" },
  { id: "settings", label: "Settings" },
];
const LEADS_GATE_MESSAGE = "Add at least one list of leads first.";

interface LeadList { id: string; label: string; source: string; count: number; segmentId: string | null }
interface SegmentLite { id: string; segment_name: string; contacts: number }

/** Raw DB/driver error text (column not found, constraint violations, PGRST
 *  codes, etc.) isn't meaningful to a non-technical user — swap it for a
 *  plain-English message instead of showing the internals. */
function humanizeError(message: string): string {
  if (/column|schema cache|relation .* does not exist|PGRST|violates|constraint|duplicate key/i.test(message)) {
    return "Something went wrong saving your campaign. Please try again, or contact support if it keeps happening.";
  }
  return message;
}

/** Server actions can throw plain objects (e.g. a raw Postgrest error) that lose
 *  their `.message` crossing back from the server — this defends against that
 *  showing up as a blank/"null" error in the UI. */
function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return humanizeError(err.message);
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) return humanizeError(m);
  }
  return fallback;
}

/** "Enable HTML" off → strip tags before saving so the campaign sends as plain text. */
function stripHtmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function CampaignBuilderPage() {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();

  const [tab, setTab] = useState<TabId>("leads");
  const [name, setName] = useState("Untitled Campaign");
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [dirty, setDirty] = useState(false);

  // Leads
  const [segments, setSegments] = useState<SegmentLite[]>([]);
  const [lists, setLists] = useState<LeadList[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [viewingList, setViewingList] = useState<LeadList | null>(null);
  const [viewingLeads, setViewingLeads] = useState<LeadRow[] | null>(null);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const listLeadsCache = useRef<Record<string, LeadRow[]>>({});

  // Sequence
  const [tplTab, setTplTab] = useState<"prebuilt" | "custom">("prebuilt");
  const [chosenTpl, setChosenTpl] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<string>("All");
  const [channelFilter, setChannelFilter] = useState<string>("All channels");
  const [sequence, setSequence] = useState<GeneratedEmail[]>([]);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  // Setup strip
  const [enableHtml, setEnableHtml] = useState(true);
  const [pauseSameCompany, setPauseSameCompany] = useState(false);

  // AI rewrite — asks for the user's own instruction each time, instead of
  // silently reusing the template's original goal text.
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");

  // Settings tab
  const [schedule, setSchedule] = useState("Send immediately");
  const [scheduledAt, setScheduledAt] = useState(""); // datetime-local string, only used when schedule === "Schedule for later"
  const [minScheduleAt] = useState(() => new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16));

  // Sender accounts tab
  const [senderAccounts, setSenderAccounts] = useState<OutreachAccountRow[]>([]);
  const [emailStatus, setEmailStatus] = useState<{ configured: boolean; domainVerified: boolean } | null>(null);

  // Deep-link init (?template=, ?segment=) — runs once on mount.
  useEffect(() => {
    getSegments().then((s) => {
      const mapped = s.map((x) => ({ id: x.id, segment_name: x.segment_name, contacts: x.contacts }));
      setSegments(mapped);
      const segParam = new URLSearchParams(window.location.search).get("segment");
      const seg = segParam ? mapped.find((m) => m.id === segParam) : null;
      if (seg) {
        setLists((prev) => (prev.some((l) => l.segmentId === seg.id) ? prev : [...prev, { id: `seg-${seg.id}`, label: seg.segment_name, source: "Segment", count: seg.contacts, segmentId: seg.id }]));
        // A segment was pre-selected via deep link — leads are effectively already added.
        setTab("sequence");
      }
    }).catch(() => {});
    getOutreachAccounts().then(setSenderAccounts).catch(() => {});
    getEmailStatus().then(setEmailStatus).catch(() => {});

    // Deep-link: ?template=<id> jumps straight into a pre-built sequence
    const id = new URLSearchParams(window.location.search).get("template");
    const tpl = getCampaignTemplate(id);
    if (tpl) {
      /* eslint-disable react-hooks/set-state-in-effect -- one-time init from a URL param on mount */
      setName(tpl.name);
      setPrompt(tpl.goal);
      setChosenTpl(tpl.id);
      setSequence(tpl.steps.map((s) => ({ day: s.day, subject: s.subject, body: s.body, channel: s.channel, action: s.action })));
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, []);

  // Mark unsaved whenever meaningful content changes (skip the very first render).
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) setDirty(true);
    else mountedRef.current = true;
  }, [name, lists, sequence, enableHtml, pauseSameCompany, schedule, scheduledAt]);

  function patchStep(i: number, patch: Partial<GeneratedEmail>) {
    setSequence((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  function addList(segmentId: string | null) {
    setAddOpen(false);
    const wasEmpty = lists.length === 0;
    if (segmentId === null) {
      if (lists.some((l) => l.segmentId === null)) return;
      setLists([...lists, { id: `all-${Date.now()}`, label: "All leads", source: "Workspace", count: 0, segmentId: null }]);
    } else {
      const seg = segments.find((s) => s.id === segmentId);
      if (!seg || lists.some((l) => l.segmentId === segmentId)) return;
      setLists([...lists, { id: `seg-${segmentId}`, label: seg.segment_name, source: "Segment", count: seg.contacts, segmentId }]);
    }
    // First list added → move straight into building the sequence.
    if (wasEmpty) setTab("sequence");
  }

  /** Opens a full leads table for one list — cached per list so repeat clicks are instant. */
  async function viewList(l: LeadList) {
    setViewingList(l);
    const cached = listLeadsCache.current[l.id];
    if (cached) { setViewingLeads(cached); return; }
    setViewingLeads(null);
    setLoadingLeads(true);
    try {
      const rows = l.segmentId ? await getSegmentMemberLeads(l.segmentId) : await getLeads();
      listLeadsCache.current[l.id] = rows;
      setViewingLeads(rows);
    } catch {
      setViewingLeads([]);
    } finally {
      setLoadingLeads(false);
    }
  }

  function pickTemplate(id: string) {
    const tpl = getCampaignTemplate(id);
    if (!tpl) return;
    setChosenTpl(id);
    setPrompt(tpl.goal);
    setSequence(tpl.steps.map((s) => ({ day: s.day, subject: s.subject, body: s.body, channel: s.channel, action: s.action })));
    if (name === "Untitled Campaign") setName(tpl.name);
  }

  function startCustom() {
    setChosenTpl("custom");
    setSequence([{ day: "Day 1", subject: "", body: "" }]);
  }

  function openAiRewrite() {
    setAiInput(prompt); // pre-fill with whatever goal is already known, but it's fully editable
    setAiModalOpen(true);
  }

  async function handleGenerate() {
    const instruction = aiInput.trim();
    if (!instruction) { setError("Describe what this sequence should say first."); return; }
    setError(null);
    setGenerating(true);
    try {
      const emails = await generateEmailSequence(instruction);
      if (emails.length) {
        setSequence(emails);
        setPrompt(instruction);
        setAiModalOpen(false);
      }
    } catch (err) {
      setError(getErrorMessage(err, "AI generation failed"));
    } finally {
      setGenerating(false);
    }
  }

  const mailboxAccounts = senderAccounts.filter((a) => a.channel === "email");
  const linkedinAccounts = senderAccounts.filter((a) => a.channel === "linkedin");
  const totalLeadsCount = lists.reduce((sum, l) => sum + (l.segmentId ? l.count : 0), 0) || (lists.length ? undefined : 0);

  // Hard gate: every tab except Leads is locked until at least one lead list is added.
  const leadsGate = lists.length > 0;
  const visibleTabs = PAGE_TABS
    .map((t) => ({ ...t, disabled: t.id !== "leads" && !leadsGate, disabledReason: LEADS_GATE_MESSAGE }));

  function buildContent(): string {
    return sequence.map((s) => {
      const isLi = s.channel === "linkedin";
      const header = isLi ? `${s.day} — [li:${s.action === "linkedin_message" ? "linkedin_message" : "connection_request"}]` : `${s.day} — ${s.subject}`;
      const body = !isLi && !enableHtml ? stripHtmlToText(s.body || "") : (s.body || "");
      return `${header}\n${body}`;
    }).join("\n\n---\n\n").slice(0, 20000);
  }

  /** Creates the campaign on first save, updates it on every save after that. */
  async function persist(status: "Draft" | "Active" | "Scheduled"): Promise<CampaignRow> {
    const segmentId = lists.find((l) => l.segmentId)?.segmentId ?? null;
    const isScheduled = status === "Scheduled";
    const payload: Partial<CampaignRow> = {
      campaign_name: name.trim(),
      status: status === "Active" ? "Draft" : status, // sendCampaign flips it to Active on success
      campaign_type: "Email Sequence",
      segment_id: segmentId,
      subject: sequence[0]?.subject || null,
      content: buildContent(),
      content_is_html: enableHtml,
      pause_same_company_on_reply: pauseSameCompany,
      scheduled_at: isScheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
    };
    if (campaign) {
      await updateCampaign(campaign.id, payload);
      const updated = { ...campaign, ...payload } as CampaignRow;
      setCampaign(updated);
      return updated;
    }
    const created = await createCampaign(payload);
    setCampaign(created);
    return created;
  }

  function saveDraft() {
    setError(null);
    if (!name.trim()) { setError("Campaign name required"); setTab("settings"); return; }
    start(async () => {
      try {
        await persist("Draft");
        setDirty(false);
        toast("Draft saved", "success");
      } catch (err) {
        setError(getErrorMessage(err, "Save failed"));
      }
    });
  }

  function launch() {
    setError(null);
    if (lists.length === 0) { setError("Add at least one list of leads before launching."); setTab("leads"); return; }
    if (!chosenTpl || sequence.length === 0 || !sequence.some((s) => s.subject || s.body)) { setError("Build a sequence first."); setTab("sequence"); return; }
    if (!name.trim()) { setError("Campaign name required"); setTab("settings"); return; }
    const isScheduled = schedule === "Schedule for later";
    if (isScheduled && (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now())) {
      setError("Pick a send time in the future first.");
      setTab("settings");
      return;
    }
    start(async () => {
      try {
        if (isScheduled) {
          await persist("Scheduled");
          setDirty(false);
          toast(`Scheduled for ${new Date(scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`, "success");
          router.push("/campaigns");
          return;
        }
        const saved = await persist("Draft");
        setDirty(false);
        const res = await sendCampaign(saved.id);
        if (res.ok) {
          toast(`Launched — ${res.sent} email${res.sent === 1 ? "" : "s"} sent${res.simulated ? " (simulated — no email provider live)" : ""}.`, "success");
          router.push("/campaigns");
        } else {
          setError(res.error || "Saved, but no emails were sent.");
        }
      } catch (err) {
        setError(getErrorMessage(err, "Save failed"));
      }
    });
  }

  return (
    <div className="max-w-[1500px] mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 flex-shrink-0">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-[280px] font-medium" />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={campaign?.status === "Active" ? "success" : campaign?.status === "Scheduled" ? "warning" : "default"}>
            {campaign?.status || "Draft"}
          </Badge>
          <Button onClick={launch} disabled={pending || !leadsGate} title={!leadsGate ? LEADS_GATE_MESSAGE : undefined}>
            {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Launching…</> : <><Send className="h-4 w-4" /> Launch campaign</>}
          </Button>
        </div>
      </div>

      <Tabs tabs={visibleTabs} active={tab} onChange={(id) => setTab(id as TabId)} className="mb-6" />

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="text-red-400 hover:text-red-600 flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Leads tab ── */}
      {tab === "leads" && (
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
                <Card key={l.id} className="p-4 flex items-center justify-between cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all" onClick={() => viewList(l)}>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      {l.segmentId ? <Layers3 className="h-4.5 w-4.5" /> : <Users2 className="h-4.5 w-4.5" />}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{l.label}</p>
                      <p className="text-xs text-slate-500">Added from {l.source}{l.segmentId ? ` · ${l.count} leads` : ""} · click to view leads</p>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setLists(lists.filter((x) => x.id !== l.id)); }} aria-label="Remove list" className="p-2 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Sequence tab ── */}
      {tab === "sequence" && (
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
            <div>
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <button onClick={() => { setChosenTpl(null); setTplTab("prebuilt"); }} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
                  <LayoutTemplate className="h-4 w-4" /> Change template
                </button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={openAiRewrite} disabled={generating}>
                    <Wand2 className="h-3.5 w-3.5" /> AI rewrite
                  </Button>
                  <Button variant={dirty || !campaign ? "primary" : "outline"} size="sm" onClick={saveDraft} disabled={pending}>
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : dirty || !campaign ? <><Save className="h-3.5 w-3.5" /> Save</> : <><CheckCircle2 className="h-3.5 w-3.5" /> Saved</>}
                  </Button>
                </div>
              </div>

              {/* Compact setup strip — leads + toggles, no longer a permanent sidebar */}
              <Card className="p-3 mb-4 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {lists.map((l) => (
                    <span key={l.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                      {l.label}
                      <button onClick={() => setLists(lists.filter((x) => x.id !== l.id))} className="text-slate-400 hover:text-red-600"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                  <div className="relative">
                    <button onClick={() => setAddOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
                      <Plus className="h-3 w-3" /> Lead list
                    </button>
                    {addOpen && (
                      <div className="lp-anim-pop origin-top-left absolute left-0 top-full mt-1 z-20 w-56 bg-white rounded-xl border border-slate-200 shadow-lg p-1">
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

                <div className="h-5 w-px bg-slate-200 hidden sm:block" />

                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <Switch checked={enableHtml} onChange={setEnableHtml} aria-label="Enable HTML" /> Enable HTML
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <Switch checked={pauseSameCompany} onChange={setPauseSameCompany} aria-label="Pause leads at the same company on reply" /> Pause same company on reply
                </label>

                <div className="ml-auto text-xs text-slate-400">
                  <span className="font-medium text-slate-600">{sequence.length}</span> step{sequence.length === 1 ? "" : "s"}
                  {typeof totalLeadsCount === "number" && totalLeadsCount > 0 && <> · <span className="font-medium text-slate-600">{totalLeadsCount}</span> lead{totalLeadsCount === 1 ? "" : "s"}</>}
                </div>
              </Card>

              {/* Steps — full width, stacked vertically, every step editable at once */}
                <div className="relative pl-4">
                  <div className="absolute left-[27px] top-2 bottom-10 w-px bg-slate-200" />
                  <div className="space-y-3">
                    {sequence.map((s, i) => {
                      const isLi = s.channel === "linkedin";
                      return (
                        <div key={i}>
                          {i > 0 && (
                            <div className="flex items-center gap-2 pl-1 mb-3">
                              <Clock className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-xs text-slate-500">Wait</span>
                              <input
                                type="number" min={0}
                                value={parseDelay(s.day).value}
                                onChange={(e) => {
                                  const v = Math.max(0, parseInt(e.target.value || "0", 10));
                                  patchStep(i, { day: formatDelay(v, parseDelay(s.day).unit) });
                                }}
                                className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-200"
                              />
                              <select
                                value={parseDelay(s.day).unit}
                                onChange={(e) => patchStep(i, { day: formatDelay(parseDelay(s.day).value, e.target.value as (typeof DELAY_UNITS)[number]) })}
                                className="rounded-md border border-slate-200 px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-200"
                              >
                                {DELAY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                              </select>
                              <span className="text-xs text-slate-400">after previous step</span>
                            </div>
                          )}
                          <Card className="p-4 ml-0">
                            <div className="flex items-start gap-3">
                              <div className={cn("h-8 w-8 rounded-full text-white flex items-center justify-center flex-shrink-0 text-xs font-semibold relative z-10", isLi ? "bg-sky-600" : "bg-blue-600")}>
                                {isLi ? <Share2 className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                                  <span className="text-xs font-semibold text-slate-500">Step {i + 1} · {s.day}</span>
                                  <div className="flex items-center gap-2">
                                    <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                                      <button onClick={() => patchStep(i, { channel: "email", action: "email" })} className={`px-2 py-0.5 text-xs rounded-md ${!isLi ? "bg-white shadow-sm text-slate-900 font-medium" : "text-slate-500"}`}>Email</button>
                                      <button onClick={() => patchStep(i, { channel: "linkedin", action: s.action && s.action !== "email" ? s.action : "connection_request" })} className={`px-2 py-0.5 text-xs rounded-md ${isLi ? "bg-white shadow-sm text-sky-700 font-medium" : "text-slate-500"}`}>LinkedIn</button>
                                    </div>
                                    {sequence.length > 1 && (
                                      <button onClick={() => setSequence(sequence.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                                    )}
                                  </div>
                                </div>
                                {isLi ? (
                                  <>
                                    <select
                                      value={s.action === "linkedin_message" ? "linkedin_message" : "connection_request"}
                                      onChange={(e) => patchStep(i, { action: e.target.value as "connection_request" | "linkedin_message" })}
                                      className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm bg-slate-50 mb-2 focus:outline-none focus:ring-1 focus:ring-sky-200"
                                    >
                                      <option value="connection_request">Connection request</option>
                                      <option value="linkedin_message">LinkedIn message</option>
                                    </select>
                                    <Textarea value={s.body} onChange={(e) => patchStep(i, { body: e.target.value })} rows={3} placeholder={s.action === "linkedin_message" ? "Message…" : "Note to include with the invite (optional)…"} className="bg-slate-50 text-sm" />
                                  </>
                                ) : (
                                  <>
                                    <Input value={s.subject} onChange={(e) => patchStep(i, { subject: e.target.value })} placeholder="Subject line" className="font-medium mb-2 bg-slate-50" />
                                    <RichTextEditor value={s.body} onChange={(html) => patchStep(i, { body: html })} placeholder="Write your email…" minHeight={180} />
                                  </>
                                )}
                              </div>
                            </div>
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                  <Button variant="outline" className="ml-0 mt-3" onClick={() => setSequence([...sequence, { day: formatDelay(3, "days"), subject: "", body: "" }])}>
                    <Plus className="h-4 w-4" /> Add step
                  </Button>
                </div>
              </div>
          )}

          {/* AI rewrite — takes the user's own instruction, doesn't silently reuse the template goal */}
          <Modal open={aiModalOpen} onClose={() => setAiModalOpen(false)} title="AI rewrite" description="Describe what this sequence should say — the AI writes from your input." size="md">
            <div className="p-5 space-y-3">
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span className="flex-1">{error}</span>
                  <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="text-red-400 hover:text-red-600 flex-shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <Textarea
                autoFocus
                rows={4}
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder="e.g. Follow up after a product demo, focus on urgency and offer a discount for signing this week."
              />
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAiModalOpen(false)} disabled={generating}>Cancel</Button>
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Writing…</> : <><Wand2 className="h-4 w-4" /> Generate</>}
              </Button>
            </div>
          </Modal>
        </div>
      )}

      {/* ── Sender accounts tab ── */}
      {tab === "sender" && (
        <div className="max-w-2xl space-y-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Sender accounts</h2>
            <p className="text-sm text-slate-500 mt-1">
              Campaign emails send through your workspace&apos;s configured email service
              {emailStatus ? (emailStatus.domainVerified ? " (live)" : " (sandbox — connect a verified domain in Settings)") : ""}.
              Connect a mailbox below to capture replies, and connect LinkedIn to run LinkedIn steps.
            </p>
          </div>

          <Card className="p-5">
            <p className="text-sm font-semibold text-slate-900 mb-3">Mailboxes</p>
            {mailboxAccounts.length === 0 ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500">No mailbox connected yet.</p>
                <Link href="/settings?section=email"><Button variant="outline">Connect mailbox</Button></Link>
              </div>
            ) : (
              <div className="space-y-2">
                {mailboxAccounts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-slate-700"><Mail className="h-4 w-4 text-slate-400" /> {a.identifier || a.name || "Mailbox"}</span>
                    <Badge variant={a.status === "connected" ? "success" : "warning"}>{a.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <p className="text-sm font-semibold text-slate-900 mb-3">LinkedIn</p>
            {linkedinAccounts.length === 0 ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500">No LinkedIn account connected — LinkedIn steps will be skipped.</p>
                <Link href="/outreach"><Button variant="outline">Connect LinkedIn</Button></Link>
              </div>
            ) : (
              <div className="space-y-2">
                {linkedinAccounts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-slate-700"><Share2 className="h-4 w-4 text-slate-400" /> {a.identifier || a.name || "LinkedIn account"}</span>
                    <Badge variant={a.status === "connected" ? "success" : "warning"}>{a.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Settings tab ── */}
      {tab === "settings" && (
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
            {schedule === "Schedule for later" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Send at</label>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  min={minScheduleAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
                <p className="text-xs text-slate-400 mt-1">Step 1 goes out at this time in your local timezone.</p>
              </div>
            )}
            <div className="text-sm text-slate-500 flex items-center gap-2 bg-slate-50 rounded-lg p-3">
              <Filter className="h-4 w-4 flex-shrink-0" /> Leads who reply are automatically put on hold — no further steps are sent.
            </div>
          </Card>
        </div>
      )}

      {/* Bottom bar — save draft, always available */}
      <div className="mt-6 flex items-center justify-end">
        <Button variant="outline" onClick={saveDraft} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
        </Button>
      </div>

      <AddLeadsWizard open={showImport} onClose={() => setShowImport(false)} />

      {/* Preview a list's actual leads — the real data table, not a bare card */}
      <Modal
        open={viewingList !== null}
        onClose={() => { setViewingList(null); setViewingLeads(null); }}
        title={viewingList?.label}
        description={viewingList ? `${viewingList.segmentId ? "Segment" : "Workspace"} · who this list actually reaches` : undefined}
        size="xl"
      >
        <div className="p-5 max-h-[75vh] overflow-y-auto bg-slate-50/60">
          {loadingLeads ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading leads…
            </div>
          ) : viewingLeads && viewingLeads.length > 0 ? (
            <LeadsTable leads={viewingLeads} />
          ) : (
            <div className="py-16 text-center text-sm text-slate-500">No leads in this list yet.</div>
          )}
        </div>
      </Modal>

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
