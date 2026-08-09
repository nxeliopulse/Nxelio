"use client";
import { useState, useTransition, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Users2, Send, MailOpen, Reply, AlertTriangle, Clock,
  BarChart3, MousePointerClick, CalendarClock, Loader2, X,
} from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd } from "@/components/ui/table";
import { useFeedback } from "@/components/ui/feedback";
import { setCampaignStatus, updateCampaign, type CampaignRow } from "@/lib/queries/campaigns";
import { sendCampaign } from "@/lib/email/campaign-send";
import { notifyCreditsChanged } from "@/lib/credits-refresh";
import { approvalBadgeVariant } from "@/lib/campaign-approval-ui";
import { campaignChannelLabel, ChannelBadge } from "@/components/campaigns/campaigns-view";
import { SequenceFlow, type FlowStep } from "@/components/campaigns/sequence-flow";
import { FlowCanvas } from "@/components/campaigns/flow-canvas";
import { parseDelay, formatDelay, DELAY_UNITS } from "@/lib/sequence-delay";
import { formatDate, cn } from "@/lib/utils";
import { InboxView } from "@/components/inbox/inbox-view";
import { LockedFeature } from "@/components/billing/locked-feature";
import type { InboxConversation } from "@/lib/queries/inbox";
import type { LeadRow } from "@/lib/queries/leads";
import type { LeadEngagementRow } from "@/lib/email/campaign-stats";
import { getEnrollments, getEnrollmentCounts, type CampaignEnrollmentRow, type EnrollmentStatus } from "@/lib/campaigns/enrollment";
import { AddProspectsDrawer } from "@/components/campaigns/add-prospects-drawer";
import type { SegmentRow } from "@/lib/queries/segments";

/** "Jul 2, 3:45 PM" — used in the activity table so opens/sends are traceable to a moment, not just a rate. */
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  return d.toDateString() === n.toDateString();
}

/** Reconstruct sequence steps from the stored "Day N — Subject\nBody" blocks. */
function parseSequence(content: string | null): FlowStep[] {
  if (!content) return [];
  return content
    .split(/\n+\s*---\s*\n+/)
    .map((block, i) => {
      const lines = block.trim().split("\n");
      const header = lines[0] || "";
      // Split on the first " — " into [delay label, subject-or-LinkedIn-marker]
      const m = header.match(/^(.*?)\s+—\s+(.*)$/);
      const day = m ? m[1] : (i === 0 ? "Day 1" : "No delay");
      const headerSubject = m ? m[2] : header;
      const body = lines.slice(1).join("\n").trim();
      const li = headerSubject.match(/^\[li:(connection_request|linkedin_message|message)\]$/i);
      if (li) {
        const action = /connection/i.test(li[1]) ? "connection_request" as const : "linkedin_message" as const;
        return { day, subject: "", body, channel: "linkedin" as const, action };
      }
      return { day, subject: headerSubject, body, channel: "email" as const, action: "email" as const };
    })
    .filter((s) => s.subject || s.body || s.channel === "linkedin");
}

/** Serialize a step back to stored text (channel-aware). */
function serializeStep(s: FlowStep): string {
  const header = s.channel === "linkedin"
    ? `${s.day} — [li:${s.action === "linkedin_message" ? "linkedin_message" : "connection_request"}]`
    : `${s.day} — ${s.subject}`;
  return `${header}\n${s.body || ""}`;
}

const TABS = ["Audience", "Enrollments", "Sequence", "Analytics", "Inbox", "Settings"] as const;
type Tab = (typeof TABS)[number];

export function CampaignDetailView({
  campaign, audience, audienceLabel, pendingJobs = 0, inboxConversations = [], audienceLeads = [], leadActivity = [], replyTrackingEnabled = false, owners = {},
  segments = [], campaigns = [], leadStatsTotal = 0,
}: {
  campaign: CampaignRow;
  audience: number;
  audienceLabel: string;
  pendingJobs?: number;
  inboxConversations?: InboxConversation[];
  audienceLeads?: LeadRow[];
  leadActivity?: LeadEngagementRow[];
  replyTrackingEnabled?: boolean;
  owners?: Record<string, string>;
  segments?: (SegmentRow & { contacts: number })[];
  campaigns?: CampaignRow[];
  leadStatsTotal?: number;
}) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [pending, start] = useTransition();
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<Tab>("Audience");
  const [name, setName] = useState(campaign.campaign_name);
  const [status, setStatusLocal] = useState(campaign.status);

  // While a campaign is Active, poll for fresh stats so sent/opened/replied/pending
  // update on their own (follow-ups send via cron, opens arrive via webhook) without
  // a manual refresh.
  useEffect(() => {
    if (status !== "Active") return;
    const t = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(t);
  }, [status, router]);

  // Phase 4I — enrollment counts for the Matched→Eligible→Enrolled→Completed
  // reconciliation strip. Fetched once per campaign; the Enrollment Monitor
  // tab is the live/detailed view, this is just the summary.
  const [enrollmentCounts, setEnrollmentCounts] = useState<Record<EnrollmentStatus, number> | null>(null);
  useEffect(() => {
    getEnrollmentCounts(campaign.id).then(setEnrollmentCounts).catch(() => {});
  }, [campaign.id]);

  // Editable sequence steps (parsed from saved content) + inline node editor
  const [steps, setSteps] = useState<FlowStep[]>(() => parseSequence(campaign.content));
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<FlowStep>({ day: "Day 1", subject: "", body: "" });
  const [activityFilter, setActivityFilter] = useState<"all" | "sent" | "opened" | "replied" | "bounced">("all");
  const filteredActivity = useMemo(() => {
    return (leadActivity ?? []).filter((act) => {
      if (activityFilter === "sent") return !!act.sentAt;
      if (activityFilter === "opened") return !!act.openedAt;
      if (activityFilter === "replied") return !!act.repliedAt;
      if (activityFilter === "bounced") return !!act.bouncedAt;
      return true;
    });
  }, [leadActivity, activityFilter]);

  // Sequence content is locked once launched (Phase 4) — the audience already
  // received (or is scheduled for) whatever was live at launch time, so
  // editing it afterward would silently diverge from what people actually got.
  const contentLocked = status !== "Draft";
  function openStep(i: number) {
    if (contentLocked) return;
    setEditIndex(i);
    setDraft({ ...steps[i] });
  }
  function saveStep() {
    if (editIndex === null) return;
    const next = steps.map((s, j) => (j === editIndex ? { ...draft } : s));
    setSteps(next);
    setEditIndex(null);
    const content = next.map(serializeStep).join("\n\n---\n\n").slice(0, 5000);
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
  // Real pending = follow-up steps queued but not yet sent (falls back to audience-sent
  // for single-step campaigns that have no scheduled jobs).
  const pending_ = pendingJobs > 0 ? pendingJobs : Math.max(0, audience - sent);
  const progress = audience > 0 ? Math.min(100, Math.round((sent / audience) * 100)) : 0;
  const isActive = status === "Active";

  // Honest tiles derived from real columns (not invented status buckets).
  const tiles = [
    { label: "Audience", value: audience, icon: <Users2 className="h-4 w-4" />, color: "text-blue-600 bg-blue-50", key: "all", ring: "ring-blue-500", bg: "bg-blue-50/20" },
    { label: "Sent", value: sent, icon: <Send className="h-4 w-4" />, color: "text-indigo-600 bg-indigo-50", key: "sent", ring: "ring-indigo-500", bg: "bg-indigo-50/20" },
    { label: "Opened", value: opened, icon: <MailOpen className="h-4 w-4" />, color: "text-emerald-600 bg-emerald-50", key: "opened", ring: "ring-emerald-500", bg: "bg-emerald-50/20" },
    { label: "Replied", value: replied, icon: <Reply className="h-4 w-4" />, color: "text-teal-600 bg-teal-50", key: "replied", ring: "ring-teal-500", bg: "bg-teal-50/20" },
    { label: "Bounced", value: bounced, icon: <AlertTriangle className="h-4 w-4" />, color: "text-red-600 bg-red-50", key: "bounced", ring: "ring-red-500", bg: "bg-red-50/20" },
    { label: "Pending", value: pending_, icon: <Clock className="h-4 w-4" />, color: "text-amber-600 bg-amber-50", key: "all", ring: "ring-amber-500", bg: "bg-amber-50/20" },
  ];

  function toggleStatus() {
    const next = isActive ? "Paused" : "Active";
    setStatusLocal(next);
    start(async () => { await setCampaignStatus(campaign.id, next); });
  }
  // Split-and-send (Phase 4A) — `null` means "everyone" (the default); once the
  // user unchecks anyone in the Audience tab this becomes the explicit subset
  // to launch to. Only meaningful pre-launch (Draft) — once launched the whole
  // concept of "who to include" is moot, the audience is already frozen.
  const [includedLeadIds, setIncludedLeadIds] = useState<Set<string> | null>(null);
  async function handleSendNow() {
    const includeIds = includedLeadIds ? [...includedLeadIds] : undefined;
    const launchCount = includeIds ? includeIds.length : audience;
    if (!(await confirm({ title: "Send this campaign?", message: `Send the opener email to ${includeIds ? `${launchCount.toLocaleString()} selected prospects` : `everyone in “${audienceLabel}” (${audience.toLocaleString()} prospects)`}.`, confirmLabel: "Send now" }))) return;
    setSending(true);
    try {
      const res = await sendCampaign(campaign.id, includeIds);
      if (res.ok) {
        const chargedLeads = res.sent + res.failed + res.skipped + (res.deferred ?? 0);
        toast(`Campaign sent successfully — ${res.sent} email${res.sent === 1 ? "" : "s"}${res.scheduled ? `, ${res.scheduled} follow-up${res.scheduled === 1 ? "" : "s"} scheduled` : ""}${res.deferred ? `, ${res.deferred} queued for tomorrow (daily limit reached)` : ""}${res.simulated ? " (simulated)" : ""}. ${chargedLeads * 2} credits used.`, "success");
        notifyCreditsChanged();
        // The Launch button/Status dropdown read local `status` state, which
        // router.refresh() alone doesn't update (it re-renders server data but
        // this component's own useState isn't re-initialized) — set it directly
        // so the UI reflects "launched" immediately, not just after a manual reload.
        setStatusLocal("Active");
        router.refresh();
      }
      else toast(res.error || "No emails were sent.", "error");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Send failed. Try again.", "error");
    } finally {
      setSending(false);
    }
  }
  function saveName() {
    start(async () => { await updateCampaign(campaign.id, { campaign_name: name.trim() || "Untitled Campaign" }); toast("Campaign updated", "success"); });
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
              <Badge variant={approvalBadgeVariant(campaign.approval_status)}>{campaign.approval_status}</Badge>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden max-w-md">
              <div className={cn("h-full bg-blue-500 rounded-full transition-all", isActive && "lp-progress-active")} style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-2">
              <span>{sent.toLocaleString()} of {audience.toLocaleString()} sent · {progress}%</span>
              <ChannelBadge label={campaignChannelLabel(campaign.content)} />
              {isActive && <span className="inline-flex items-center gap-1 text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> running</span>}
            </p>
          </div>

          <div className="lg:w-64 lg:border-l lg:border-slate-100 lg:pl-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Performance</p>
            <div className="flex items-center justify-between text-sm mb-1"><span className="text-slate-500">Open rate</span><span className="font-semibold text-slate-900">{openRate}%</span></div>
            <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Reply rate</span><span className="font-semibold text-emerald-700">{replyRate}%</span></div>
          </div>

          <div className="flex items-center gap-3 lg:flex-col lg:items-end lg:gap-2">
            <div className="flex items-center gap-2">
              <Button
                onClick={handleSendNow}
                disabled={pending || sending || status !== "Draft" && status !== "Scheduled"}
                title={
                  status === "Active" ? "This campaign has already launched — its audience is locked to who was enrolled at launch."
                  : status === "Paused" || status === "Completed" ? `This campaign is ${status.toLowerCase()} — reactivate it to launch.`
                  : undefined
                }
              >
                {sending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Launching…</>
                  : <><Send className="h-4 w-4" /> Launch</>}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {status === "Completed" ? (
                <Badge variant="success" className="text-xs">Completed</Badge>
              ) : (
                <button
                  role="switch" aria-checked={isActive} aria-label={isActive ? "Pause campaign" : "Activate campaign"}
                  onClick={toggleStatus} disabled={pending}
                  className={cn("relative h-6 w-11 rounded-full transition-colors flex-shrink-0", isActive ? "bg-blue-600" : "bg-slate-300")}
                >
                  <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", isActive ? "translate-x-5" : "translate-x-0")} />
                </button>
              )}
              <span className="text-xs text-slate-400">{formatDate(campaign.updated_at)}</span>
            </div>
          </div>
        </div>
      </Card>

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

      {/* Audience — the actual leads this campaign targets, not just a count.
          Read-only here on purpose (Phase 4): editing a lead's own fields
          happens on its full Lead Details page, not inline in a campaign. */}
      {tab === "Audience" && (
        <CampaignAudienceTable
          campaignId={campaign.id}
          segmentId={campaign.segment_id}
          audienceLabel={audienceLabel}
          audience={audience}
          leads={audienceLeads}
          owners={owners}
          selectable={status === "Draft"}
          includedLeadIds={includedLeadIds}
          onIncludedLeadIdsChange={setIncludedLeadIds}
          segments={segments}
          campaigns={campaigns}
          leadStatsTotal={leadStatsTotal}
        />
      )}

      {/* Enrollments (Phase 4H) — one row per campaign_enrollments record;
          "who's in this campaign and where are they", not reconstructed
          after the fact from inbox_messages. */}
      {tab === "Enrollments" && (
        <EnrollmentMonitor campaignId={campaign.id} audienceLeads={audienceLeads} />
      )}

      {/* Sequence */}
      {tab === "Sequence" && (
        <div>
          <h2 className="font-semibold text-slate-900 mb-3">Email sequence</h2>
          {steps.length > 0 ? (
            <>
              <p className="text-xs text-slate-500 mb-2">
                {contentLocked
                  ? "This campaign has launched — its sequence content is locked and can no longer be edited."
                  : "Tip: click any email node to edit it. Drag to pan, Ctrl/Cmd + scroll (or the +/− buttons) to zoom."}
              </p>
              <FlowCanvas>
                <SequenceFlow steps={steps} onStepClick={openStep} />
              </FlowCanvas>
            </>
          ) : (
            <Card className="p-10 text-center text-sm text-slate-500">No sequence yet. Click <strong>Edit sequence</strong> to build it.</Card>
          )}
        </div>
      )}

      {/* Analytics — aggregate tiles/rates plus the actual per-lead, per-date data */}
      {tab === "Analytics" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {tiles.map((t) => {
              const active = activityFilter === t.key;
              return (
                <Card
                  key={t.label}
                  onClick={() => setActivityFilter(t.key as any)}
                  className={cn(
                    "p-4 cursor-pointer select-none transition-all duration-200 hover:scale-[1.02] hover:shadow-xs",
                    active
                      ? `ring-2 ${t.ring} ${t.bg} border-transparent shadow-xs`
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  )}
                >
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center mb-2 ${t.color}`}>{t.icon}</div>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">{t.value.toLocaleString()}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.label}</p>
                </Card>
              );
            })}
          </div>

          <Card className="p-5">
            <p className="text-sm font-medium text-slate-500 mb-3">Funnel</p>
            <div className="flex items-center gap-1.5">
              {[
                { label: "Sent", value: sent, color: "bg-indigo-500" },
                { label: "Opened", value: opened, color: "bg-emerald-500" },
                { label: "Replied", value: replied, color: "bg-teal-500" },
                { label: "Bounced", value: bounced, color: "bg-red-500" },
              ].map((s) => (
                <div key={s.label} className="flex-1 min-w-0">
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={cn("h-full rounded-full", s.color)} style={{ width: `${sent > 0 ? Math.min(100, (s.value / sent) * 100) : 0}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">{s.label} <span className="font-semibold text-slate-700">{s.value.toLocaleString()}</span></p>
                </div>
              ))}
            </div>
          </Card>

          {/* Phase 4I — enrollment reconciliation: Matched → Eligible → Enrolled
              → Completed, numbers pulled from campaign_enrollments so they
              always agree with the Enrollment Monitor tab. */}
          {enrollmentCounts && (
            <Card className="p-5">
              <p className="text-sm font-medium text-slate-500 mb-3">Enrollment reconciliation</p>
              <div className="flex items-center gap-1.5">
                {(() => {
                  const enrolledTotal = Object.values(enrollmentCounts).reduce((a, b) => a + b, 0);
                  const activeLike = enrollmentCounts.active + enrollmentCounts.scheduled + enrollmentCounts.pending_review + enrollmentCounts.paused;
                  const bars = [
                    { label: "Enrolled", value: enrolledTotal, color: "bg-blue-500" },
                    { label: "Active", value: activeLike, color: "bg-indigo-500" },
                    { label: "Completed", value: enrollmentCounts.completed, color: "bg-emerald-500" },
                    { label: "Suppressed", value: enrollmentCounts.suppressed, color: "bg-amber-500" },
                    { label: "Exited", value: enrollmentCounts.exited, color: "bg-red-500" },
                  ];
                  return bars.map((s) => (
                    <div key={s.label} className="flex-1 min-w-0">
                      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className={cn("h-full rounded-full", s.color)} style={{ width: `${enrolledTotal > 0 ? Math.min(100, (s.value / enrolledTotal) * 100) : 0}%` }} />
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5">{s.label} <span className="font-semibold text-slate-700">{s.value.toLocaleString()}</span></p>
                    </div>
                  ));
                })()}
              </div>
            </Card>
          )}

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

          {/* Per-lead activity — who was sent to, who opened (and when), who replied/bounced */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-slate-900 flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-slate-400" /> Prospect activity
                </p>
                {activityFilter !== "all" && (
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                    <span className="capitalize">{activityFilter}</span>
                    <button
                      onClick={() => setActivityFilter("all")}
                      title="Clear filter"
                      className="p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 cursor-pointer ml-0.5"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-400">{leadActivity.filter((r) => isToday(r.openedAt)).length} opened today</p>
            </div>
            {filteredActivity.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">No matching activity recorded yet.</p>
            ) : (
              <DataTable>
                <DataTableHead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <DataTableTh>Prospect</DataTableTh>
                    <DataTableTh>Sent</DataTableTh>
                    <DataTableTh>Opened</DataTableTh>
                    <DataTableTh>Replied</DataTableTh>
                    <DataTableTh>Clicked</DataTableTh>
                    <DataTableTh>Bounced</DataTableTh>
                  </tr>
                </DataTableHead>
                <DataTableBody className="divide-y divide-slate-100">
                  {filteredActivity.map((r) => (
                    <DataTableRow key={r.leadId}>
                      <DataTableTd>
                        <p className="font-medium text-slate-900">{r.leadName}</p>
                        {r.leadEmail && <p className="text-xs text-slate-400">{r.leadEmail}</p>}
                      </DataTableTd>
                      <DataTableTd className="text-slate-600">{fmtDateTime(r.sentAt)}</DataTableTd>
                      <DataTableTd>
                        {r.openedAt ? (
                          <span className={cn("inline-flex items-center gap-1.5", isToday(r.openedAt) ? "text-emerald-700 font-medium" : "text-slate-600")}>
                            <MailOpen className="h-3.5 w-3.5" /> {fmtDateTime(r.openedAt)} {isToday(r.openedAt) && <Badge variant="success">Today</Badge>}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </DataTableTd>
                      <DataTableTd className="text-slate-600">
                        {r.repliedAt ? <span className="inline-flex items-center gap-1.5 text-teal-700"><Reply className="h-3.5 w-3.5" /> {fmtDateTime(r.repliedAt)}</span> : "—"}
                      </DataTableTd>
                      <DataTableTd className="text-slate-600">
                        {r.clickedAt ? <span className="inline-flex items-center gap-1.5 text-indigo-600"><MousePointerClick className="h-3.5 w-3.5" /> {fmtDateTime(r.clickedAt)}</span> : "—"}
                      </DataTableTd>
                      <DataTableTd className="text-slate-600">
                        {r.bouncedAt ? <span className="inline-flex items-center gap-1.5 text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> {fmtDateTime(r.bouncedAt)}</span> : "—"}
                      </DataTableTd>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            )}
          </Card>
        </div>
      )}

      {/* Inbox — this campaign's replies, scoped from the shared inbox_messages table */}
      {tab === "Inbox" && (
        replyTrackingEnabled
          ? <InboxView conversations={inboxConversations} embedded campaignId={campaign.id} />
          : <LockedFeature feature="Reply Tracking" />
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
              <Select
                value={status}
                disabled={status === "Completed" || status === "Draft"}
                title={
                  status === "Completed" ? "A completed campaign's status can't be changed."
                  : status === "Draft" ? "Use the Launch button to move this campaign out of Draft."
                  : undefined
                }
                onChange={(e) => { setStatusLocal(e.target.value); start(async () => { await setCampaignStatus(campaign.id, e.target.value); }); }}
              >
                {/* Active/Paused may only move between each other from here — Draft is a
                    one-way starting state (never something to revert back into once
                    launched) and Completed is set automatically when the sequence finishes. */}
                <option disabled={status === "Active" || status === "Paused"}>Draft</option>
                <option>Active</option>
                <option>Paused</option>
                <option disabled={status === "Active" || status === "Paused"}>Completed</option>
              </Select>
              {status === "Completed" && <p className="text-xs text-slate-400 mt-1">This campaign is completed — its status is locked.</p>}
              {status === "Draft" && <p className="text-xs text-slate-400 mt-1">This campaign hasn&apos;t launched yet — use the Launch button above.</p>}
            </div>
          </Card>
        </div>
      )}

      {/* Inline step editor — opens when a node on the canvas is clicked */}
      <Modal open={editIndex !== null} onClose={() => setEditIndex(null)} title={`Edit step ${editIndex !== null ? editIndex + 1 : ""}`} description="Modify this step in the sequence" size="lg">
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Wait before this step</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0}
                value={parseDelay(draft.day).value}
                onChange={(e) => setDraft({ ...draft, day: formatDelay(Math.max(0, parseInt(e.target.value || "0", 10)), parseDelay(draft.day).unit) })}
                className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <Select
                value={parseDelay(draft.day).unit}
                onChange={(e) => setDraft({ ...draft, day: formatDelay(parseDelay(draft.day).value, e.target.value as (typeof DELAY_UNITS)[number]) })}
                className="max-w-[160px]"
              >
                {DELAY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
              <span className="text-sm text-slate-400">after previous step</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Channel</label>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
              <button
                type="button"
                onClick={() => setDraft({ ...draft, channel: "email", action: "email" })}
                className={`px-3 py-1 text-xs font-medium rounded-md ${draft.channel !== "linkedin" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, channel: "linkedin", action: draft.action && draft.action !== "email" ? draft.action : "connection_request" })}
                className={`px-3 py-1 text-xs font-medium rounded-md ${draft.channel === "linkedin" ? "bg-white shadow-sm text-sky-700" : "text-slate-500"}`}
              >
                LinkedIn
              </button>
            </div>
          </div>
          {draft.channel === "linkedin" ? (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Action</label>
                <Select
                  value={draft.action === "linkedin_message" ? "linkedin_message" : "connection_request"}
                  onChange={(e) => setDraft({ ...draft, action: e.target.value as "connection_request" | "linkedin_message" })}
                >
                  <option value="connection_request">Connection request</option>
                  <option value="linkedin_message">LinkedIn message</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {draft.action === "linkedin_message" ? "Message" : "Invite note (optional)"}
                </label>
                <Textarea value={draft.body || ""} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={6} placeholder={draft.action === "linkedin_message" ? "Message…" : "Note to include with invite…"} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Subject</label>
                <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="Subject line" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Body</label>
                <Textarea value={draft.body || ""} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={8} placeholder="Email body…" />
              </div>
            </>
          )}
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEditIndex(null)}>Cancel</Button>
          <Button onClick={saveStep} disabled={pending}>{pending ? "Saving…" : "Save step"}</Button>
        </div>
      </Modal>
    </div>
  );
}

/** Phase 4 — read-only campaign audience table + "Add prospect". Clicking a
 *  row navigates to the lead's full detail page (that's where field editing
 *  actually happens); this table never edits/deletes a lead in place. */
function CampaignAudienceTable({
  campaignId, segmentId, audienceLabel, audience, leads, owners,
  selectable = false, includedLeadIds, onIncludedLeadIdsChange,
  segments, campaigns, leadStatsTotal,
}: {
  campaignId: string;
  segmentId: string | null;
  audienceLabel: string;
  audience: number;
  leads: LeadRow[];
  owners: Record<string, string>;
  /** Draft-only (Phase 4A split-and-send): show per-row checkboxes to choose
   *  who this launch actually includes. */
  selectable?: boolean;
  includedLeadIds?: Set<string> | null;
  onIncludedLeadIdsChange?: (ids: Set<string> | null) => void;
  segments: (SegmentRow & { contacts: number })[];
  campaigns: CampaignRow[];
  leadStatsTotal: number;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  // null = "everyone" (default) — only materialize the explicit Set once the
  // user actually deselects someone.
  const isIncluded = (id: string) => !includedLeadIds || includedLeadIds.has(id);
  function toggleIncluded(id: string) {
    if (!onIncludedLeadIdsChange) return;
    const base = includedLeadIds ?? new Set(leads.map((l) => l.id));
    const next = new Set(base);
    if (next.has(id)) next.delete(id); else next.add(id);
    onIncludedLeadIdsChange(next.size === leads.length ? null : next);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-slate-900">{audienceLabel}</h2>
          <p className="text-xs text-slate-500">
            {leads.length.toLocaleString()} of {audience.toLocaleString()} prospects shown below
            {selectable && includedLeadIds && ` · ${includedLeadIds.size.toLocaleString()} selected to launch to`}
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>Add prospects</Button>
      </div>

      {selectable && (
        <p className="text-xs text-slate-500 mb-2">Uncheck anyone you don&apos;t want this launch to include — everyone&apos;s included by default.</p>
      )}

      {leads.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">No prospects in this audience yet.</Card>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableRow>
              {selectable && <DataTableTh className="w-8" />}
              <DataTableTh>Name</DataTableTh>
              <DataTableTh>Company</DataTableTh>
              <DataTableTh>Email</DataTableTh>
              <DataTableTh>Owner</DataTableTh>
              <DataTableTh>Status</DataTableTh>
            </DataTableRow>
          </DataTableHead>
          <DataTableBody className="divide-y divide-slate-100">
            {leads.map((l) => (
              <DataTableRow key={l.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/leads/${l.id}`)}>
                {selectable && (
                  <DataTableTd onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={isIncluded(l.id)} onChange={() => toggleIncluded(l.id)} className="rounded border-slate-300" />
                  </DataTableTd>
                )}
                <DataTableTd className="font-medium text-slate-900">{l.full_name || "—"}</DataTableTd>
                <DataTableTd className="text-slate-600">{l.company_name || "—"}</DataTableTd>
                <DataTableTd className="text-slate-600">{l.email || "—"}</DataTableTd>
                <DataTableTd className="text-slate-500">{l.owner_id ? owners[l.owner_id] || "—" : "Unassigned"}</DataTableTd>
                <DataTableTd><Badge variant="default">{l.status}</Badge></DataTableTd>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <AddProspectsDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        campaignId={campaignId}
        segmentId={segmentId}
        audienceLabel={audienceLabel}
        segments={segments}
        campaigns={campaigns}
        leadStatsTotal={leadStatsTotal}
      />
    </div>
  );
}

const ENROLLMENT_STATUS_VARIANT: Record<EnrollmentStatus, "success" | "warning" | "danger" | "blue" | "default"> = {
  pending_review: "warning", scheduled: "blue", active: "success", paused: "warning",
  completed: "success", exited: "default", suppressed: "danger", failed: "danger", cancelled: "default",
};

/** Phase 4H — Enrollment Monitor. One row per campaign_enrollments record,
 *  joined in-memory against the audience leads already fetched for this page
 *  (no second lead query). Search / status filter / sort, all client-side —
 *  campaigns run at a scale where this stays fast without a server round-trip
 *  per keystroke. */
function EnrollmentMonitor({ campaignId, audienceLeads }: { campaignId: string; audienceLeads: LeadRow[] }) {
  const [rows, setRows] = useState<CampaignEnrollmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EnrollmentStatus>("all");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getEnrollments(campaignId).then((r) => { if (!cancelled) { setRows(r); setLoading(false); } }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId]);

  const leadById = useMemo(() => new Map(audienceLeads.map((l) => [l.id, l])), [audienceLeads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => {
        if (!q) return true;
        const lead = leadById.get(r.lead_id);
        return (lead?.full_name || "").toLowerCase().includes(q) || (lead?.company_name || "").toLowerCase().includes(q) || (lead?.email || "").toLowerCase().includes(q);
      })
      .sort((a, b) => sortNewestFirst
        ? new Date(b.entered_at).getTime() - new Date(a.entered_at).getTime()
        : new Date(a.entered_at).getTime() - new Date(b.entered_at).getTime());
  }, [rows, search, statusFilter, leadById, sortNewestFirst]);

  const statusCounts = useMemo(() => {
    const counts = new Map<EnrollmentStatus, number>();
    for (const r of rows) counts.set(r.status, (counts.get(r.status) || 0) + 1);
    return counts;
  }, [rows]);

  if (loading) return <Card className="p-10 text-center text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading enrollments…</Card>;
  if (rows.length === 0) return <Card className="p-10 text-center text-sm text-slate-500">No enrollments yet — launch this campaign to enroll its audience.</Card>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, company, or email…" className="max-w-xs" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | EnrollmentStatus)} className="max-w-[180px]">
          <option value="all">All statuses ({rows.length})</option>
          {(Object.keys(ENROLLMENT_STATUS_VARIANT) as EnrollmentStatus[]).filter((s) => statusCounts.get(s)).map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")} ({statusCounts.get(s)})</option>
          ))}
        </Select>
        <Button variant="outline" size="sm" onClick={() => setSortNewestFirst((v) => !v)}>
          <Clock className="h-3.5 w-3.5" /> {sortNewestFirst ? "Newest" : "Oldest"} first
        </Button>
      </div>

      <DataTable>
        <DataTableHead>
          <DataTableRow>
            <DataTableTh>Prospect</DataTableTh>
            <DataTableTh>Current step</DataTableTh>
            <DataTableTh>Next action</DataTableTh>
            <DataTableTh>Status</DataTableTh>
            <DataTableTh>Entered</DataTableTh>
            <DataTableTh>Exit reason</DataTableTh>
          </DataTableRow>
        </DataTableHead>
        <DataTableBody className="divide-y divide-slate-100">
          {filtered.map((r) => {
            const lead = leadById.get(r.lead_id);
            return (
              <DataTableRow key={r.id}>
                <DataTableTd>
                  <p className="font-medium text-slate-900">{lead?.full_name || "Unknown"}</p>
                  <p className="text-xs text-slate-500">{lead?.company_name || lead?.email || "—"}</p>
                </DataTableTd>
                <DataTableTd className="text-slate-600">Step {r.current_step}</DataTableTd>
                <DataTableTd className="text-slate-500 text-xs">{r.next_execution_at ? fmtDateTime(r.next_execution_at) : "—"}</DataTableTd>
                <DataTableTd><Badge variant={ENROLLMENT_STATUS_VARIANT[r.status]}>{r.status.replace(/_/g, " ")}</Badge></DataTableTd>
                <DataTableTd className="text-slate-500 text-xs">{fmtDateTime(r.entered_at)}</DataTableTd>
                <DataTableTd className="text-slate-500 text-xs">{r.exit_reason || "—"}</DataTableTd>
              </DataTableRow>
            );
          })}
        </DataTableBody>
      </DataTable>
    </div>
  );
}
