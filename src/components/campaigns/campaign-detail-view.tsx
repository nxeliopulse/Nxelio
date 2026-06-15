"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Users2, Send, MailOpen, Reply, AlertTriangle, Clock, Trash2,
  Layers3, Plus, BarChart3,
} from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useFeedback } from "@/components/ui/feedback";
import { setCampaignStatus, updateCampaign, deleteCampaign, type CampaignRow } from "@/lib/queries/campaigns";
import { AddLeadsWizard } from "@/components/leads/add-leads-wizard";
import { SequenceFlow, type FlowStep } from "@/components/campaigns/sequence-flow";
import { FlowCanvas } from "@/components/campaigns/flow-canvas";
import { formatDate, cn } from "@/lib/utils";

/** Reconstruct sequence steps from the stored "Day N — Subject\nBody" blocks. */
function parseSequence(content: string | null): FlowStep[] {
  if (!content) return [];
  return content
    .split(/\n+\s*---\s*\n+/)
    .map((block) => {
      const lines = block.trim().split("\n");
      const header = lines[0] || "";
      const m = header.match(/^(Day\s*\d+)\s*[—-]\s*(.*)$/);
      return {
        day: m ? m[1] : "Day 1",
        subject: m ? m[2] : header,
        body: lines.slice(1).join("\n").trim(),
      };
    })
    .filter((s) => s.subject || s.body);
}

const statusVariant: Record<string, "success" | "warning" | "default" | "blue"> = {
  Active: "success", Paused: "warning", Draft: "default", Completed: "blue",
};

const TABS = ["Audience", "Sequence", "Statistics", "Settings"] as const;
type Tab = (typeof TABS)[number];

export function CampaignDetailView({ campaign, audience, audienceLabel }: {
  campaign: CampaignRow;
  audience: number;
  audienceLabel: string;
}) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<Tab>("Audience");
  const [name, setName] = useState(campaign.campaign_name);
  const [status, setStatusLocal] = useState(campaign.status);
  const [showImport, setShowImport] = useState(false);

  // Editable sequence steps (parsed from saved content) + inline node editor
  const [steps, setSteps] = useState<FlowStep[]>(() => parseSequence(campaign.content));
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<FlowStep>({ day: "Day 1", subject: "", body: "" });

  function openStep(i: number) {
    setEditIndex(i);
    setDraft({ ...steps[i] });
  }
  function saveStep() {
    if (editIndex === null) return;
    const next = steps.map((s, j) => (j === editIndex ? { ...draft } : s));
    setSteps(next);
    setEditIndex(null);
    const content = next.map((s) => `${s.day} — ${s.subject}\n${s.body}`).join("\n\n---\n\n").slice(0, 5000);
    start(async () => {
      await updateCampaign(campaign.id, { content, subject: next[0]?.subject || null });
      toast("Step updated", "success");
    });
  }

  const sent = campaign.sent_count || 0;
  const openRate = Number(campaign.open_rate || 0);
  const replyRate = Number(campaign.reply_rate || 0);
  const bounceRate = Number(campaign.bounce_rate || 0);
  const opened = Math.round((openRate / 100) * sent);
  const replied = Math.round((replyRate / 100) * sent);
  const bounced = Math.round((bounceRate / 100) * sent);
  const pending_ = Math.max(0, audience - sent);
  const progress = audience > 0 ? Math.min(100, Math.round((sent / audience) * 100)) : 0;
  const isActive = status === "Active";

  // Honest tiles derived from real columns (not invented status buckets).
  const tiles = [
    { label: "Audience", value: audience, icon: <Users2 className="h-4 w-4" />, color: "text-blue-600 bg-blue-50" },
    { label: "Sent", value: sent, icon: <Send className="h-4 w-4" />, color: "text-indigo-600 bg-indigo-50" },
    { label: "Opened", value: opened, icon: <MailOpen className="h-4 w-4" />, color: "text-emerald-600 bg-emerald-50" },
    { label: "Replied", value: replied, icon: <Reply className="h-4 w-4" />, color: "text-teal-600 bg-teal-50" },
    { label: "Bounced", value: bounced, icon: <AlertTriangle className="h-4 w-4" />, color: "text-red-600 bg-red-50" },
    { label: "Pending", value: pending_, icon: <Clock className="h-4 w-4" />, color: "text-amber-600 bg-amber-50" },
  ];

  function toggleStatus() {
    const next = isActive ? "Paused" : "Active";
    setStatusLocal(next);
    start(async () => { await setCampaignStatus(campaign.id, next); });
  }
  function saveName() {
    start(async () => { await updateCampaign(campaign.id, { campaign_name: name.trim() || "Untitled Campaign" }); toast("Campaign updated", "success"); });
  }
  async function handleDelete() {
    if (!(await confirm({ title: "Delete campaign?", message: `Delete “${campaign.campaign_name}”? This can't be undone.`, confirmLabel: "Delete", danger: true }))) return;
    start(async () => { await deleteCampaign(campaign.id); router.push("/campaigns"); });
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to campaigns
      </Link>

      {/* Summary header */}
      <Card className="p-5 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-xl font-bold text-slate-900 truncate">{campaign.campaign_name}</h1>
              <Badge variant={statusVariant[status] || "default"}>{status}</Badge>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden max-w-md">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">{sent.toLocaleString()} of {audience.toLocaleString()} sent · {progress}%</p>
          </div>

          <div className="lg:w-64 lg:border-l lg:border-slate-100 lg:pl-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Performance</p>
            <div className="flex items-center justify-between text-sm mb-1"><span className="text-slate-500">Open rate</span><span className="font-semibold text-slate-900">{openRate}%</span></div>
            <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Reply rate</span><span className="font-semibold text-emerald-700">{replyRate}%</span></div>
          </div>

          <div className="flex items-center gap-3 lg:flex-col lg:items-end lg:gap-1.5">
            <button
              role="switch" aria-checked={isActive} aria-label={isActive ? "Pause campaign" : "Activate campaign"}
              onClick={toggleStatus} disabled={pending}
              className={cn("relative h-6 w-11 rounded-full transition-colors flex-shrink-0", isActive ? "bg-blue-600" : "bg-slate-300")}
            >
              <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", isActive ? "translate-x-5" : "translate-x-0")} />
            </button>
            <span className="text-xs text-slate-400">{formatDate(campaign.updated_at)}</span>
          </div>
        </div>
      </Card>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center mb-2 ${t.color}`}>{t.icon}</div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{t.value.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">{t.label}</p>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-slate-200 mb-5">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`relative pb-3 text-sm font-semibold transition-colors ${tab === t ? "text-blue-600" : "text-slate-500 hover:text-slate-800"}`}>
            {t}
            {tab === t && <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-blue-600 rounded-full" />}
          </button>
        ))}
      </div>

      {/* Audience */}
      {tab === "Audience" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900">Lists of leads</h2>
            <Button onClick={() => setShowImport(true)}><Plus className="h-4 w-4" /> Add leads</Button>
          </div>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Layers3 className="h-4.5 w-4.5" /></div>
                <div>
                  <p className="font-medium text-slate-900">{audienceLabel}</p>
                  <p className="text-xs text-slate-500">{audience.toLocaleString()} leads</p>
                </div>
              </div>
              <Link href={campaign.segment_id ? `/segments` : `/leads`} className="text-sm font-medium text-blue-600 hover:text-blue-700">View report →</Link>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100 text-sm max-w-md">
              <div className="flex items-center justify-between"><span className="text-slate-500">Acceptance / open</span><span className="font-semibold text-slate-900">{openRate}%</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Response</span><span className="font-semibold text-slate-900">{replyRate}%</span></div>
            </div>
          </Card>
        </div>
      )}

      {/* Sequence */}
      {tab === "Sequence" && (
        <div>
          <h2 className="font-semibold text-slate-900 mb-3">Email sequence</h2>
          {steps.length > 0 ? (
            <>
              <p className="text-xs text-slate-500 mb-2">Tip: click any email node to edit it.</p>
              <FlowCanvas>
                <SequenceFlow steps={steps} onStepClick={openStep} />
              </FlowCanvas>
            </>
          ) : (
            <Card className="p-10 text-center text-sm text-slate-500">No sequence yet. Click <strong>Edit sequence</strong> to build it.</Card>
          )}
        </div>
      )}

      {/* Statistics */}
      {tab === "Statistics" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Open rate", value: `${openRate}%`, sub: `${opened.toLocaleString()} opened` },
            { label: "Reply rate", value: `${replyRate}%`, sub: `${replied.toLocaleString()} replied` },
            { label: "Bounce rate", value: `${bounceRate}%`, sub: `${bounced.toLocaleString()} bounced` },
          ].map((s) => (
            <Card key={s.label} className="p-5">
              <div className="flex items-center gap-2 text-slate-500 text-sm mb-2"><BarChart3 className="h-4 w-4" /> {s.label}</div>
              <p className="text-3xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.sub}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Settings */}
      {tab === "Settings" && (
        <div className="max-w-xl space-y-4">
          <Card className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Campaign name</label>
              <div className="flex gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
                <Button variant="outline" onClick={saveName} disabled={pending || name.trim() === campaign.campaign_name}>Save</Button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
              <Select value={status} onChange={(e) => { setStatusLocal(e.target.value); start(async () => { await setCampaignStatus(campaign.id, e.target.value); }); }}>
                <option>Draft</option><option>Active</option><option>Paused</option><option>Completed</option>
              </Select>
            </div>
          </Card>
          <Card className="p-5 border-red-100">
            <p className="font-medium text-slate-900 mb-1">Danger zone</p>
            <p className="text-sm text-slate-500 mb-3">Permanently delete this campaign and its stats.</p>
            <Button variant="danger" onClick={handleDelete} disabled={pending}><Trash2 className="h-4 w-4" /> Delete campaign</Button>
          </Card>
        </div>
      )}

      <AddLeadsWizard open={showImport} onClose={() => setShowImport(false)} />

      {/* Inline step editor — opens when a node on the canvas is clicked */}
      <Modal open={editIndex !== null} onClose={() => setEditIndex(null)} title={`Edit step ${editIndex !== null ? editIndex + 1 : ""}`} description="Modify this email in the sequence" size="lg">
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Delay</label>
            <Input value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })} placeholder="e.g. Day 3" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Subject</label>
            <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="Subject line" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Body</label>
            <Textarea value={draft.body || ""} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={8} placeholder="Email body…" />
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEditIndex(null)}>Cancel</Button>
          <Button onClick={saveStep} disabled={pending}>{pending ? "Saving…" : "Save step"}</Button>
        </div>
      </Modal>
    </div>
  );
}
