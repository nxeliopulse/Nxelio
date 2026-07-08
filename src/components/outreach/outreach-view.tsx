"use client";
import { useState, useTransition, useEffect, useRef, useMemo, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search, Plus, MoreHorizontal, Mail, Rocket, Pause, Play, Copy, Trash2,
  Pencil, UserPlus, Users2, Loader2, CheckCircle2, AlertCircle, RefreshCw, ExternalLink, Eye,
} from "lucide-react";
import { Linkedin } from "@/components/outreach/linkedin-icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { useFeedback } from "@/components/ui/feedback";
import {
  setSequenceStatus, deleteSequence, duplicateSequence, getSequenceActivityFeed,
  type OutreachSequenceRow, type OutreachActivityFeedRow,
} from "@/lib/queries/outreach";
import {
  connectOutreachAccount, syncOutreachAccounts, deleteOutreachAccount,
  type OutreachAccountRow,
} from "@/lib/queries/outreach-accounts";
import { enrollLeads, runOutreachProcessorNow, type EnrollResult } from "@/lib/outreach/actions";
import type { LeadRow } from "@/lib/queries/leads";
import { formatDate, formatDateTime } from "@/lib/utils";

const statusVariant: Record<string, "success" | "warning" | "default" | "blue"> = {
  Active: "success",
  Paused: "warning",
  Draft: "default",
  Completed: "blue",
};

function ChannelBadges({ channel }: { channel: string }) {
  if (channel === "email") return <Badge variant="blue"><Mail className="h-3 w-3" /> Email</Badge>;
  if (channel === "linkedin") return <Badge variant="info"><Linkedin className="h-3 w-3" /> LinkedIn</Badge>;
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="info"><Linkedin className="h-3 w-3" /> LinkedIn</Badge>
      <Badge variant="blue"><Mail className="h-3 w-3" /> Email</Badge>
    </span>
  );
}

export function OutreachView({ sequences, stats, leads, accounts, unipileReady }: {
  sequences: OutreachSequenceRow[];
  stats: { active: number; enrolled: number; sent: number; replyRate: number };
  leads: LeadRow[];
  accounts: OutreachAccountRow[];
  unipileReady: boolean;
}) {
  const { toast, confirm } = useFeedback();
  const searchParams = useSearchParams();
  const connectedParam = searchParams.get("connected");
  const [tab, setTab] = useState(connectedParam === "linkedin" ? "linkedin" : connectedParam === "email" ? "email" : "sequences");
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [enrollFor, setEnrollFor] = useState<OutreachSequenceRow | null>(null);
  const [activityFor, setActivityFor] = useState<OutreachSequenceRow | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  function openMenu(e: ReactMouseEvent, id: string) {
    if (openId === id) { setOpenId(null); return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    setOpenId(id);
  }

  const filtered = sequences.filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!openId) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenId(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openId]);

  // After the Unipile connect redirect (?connected=email|linkedin), pull the
  // newly-authorized account into our DB. The initial tab is already derived
  // from the URL above, so the effect only does the side-effecting sync.
  useEffect(() => {
    if (!connectedParam) return;
    start(async () => {
      await syncOutreachAccounts();
      router.replace("/outreach");
      router.refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedParam]);

  function toggleStatus(s: OutreachSequenceRow) {
    start(async () => { await setSequenceStatus(s.id, s.status === "Active" ? "Paused" : "Active"); });
  }
  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete sequence?", message: "Delete this sequence? Enrolled leads and activity will be removed.", confirmLabel: "Delete", danger: true }))) return;
    start(async () => { await deleteSequence(id); });
  }
  function handleDuplicate(id: string) {
    setOpenId(null);
    start(async () => { await duplicateSequence(id); });
  }
  function handleRunNow() {
    start(async () => {
      const r = await runOutreachProcessorNow();
      router.refresh();
      toast(`Scheduler ran: ${r.sent} sent, ${r.failed} failed, ${r.skipped} skipped (${r.processed} due jobs processed).`, "success");
    });
  }

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="Outreach"
        description="Multi-channel LinkedIn + email sequences that reach prospects automatically"
        actions={
          <>
            <Button variant="outline" onClick={handleRunNow} disabled={pending} title="Process any due follow-up steps now (for testing without the cron scheduler)">
              <RefreshCw className="h-4 w-4" /> Run scheduler now
            </Button>
            <Link href="/outreach/builder">
              <Button><Plus className="h-4 w-4" /> New Sequence</Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Active sequences", value: stats.active },
          { label: "Leads enrolled", value: stats.enrolled.toLocaleString() },
          { label: "Messages sent", value: stats.sent.toLocaleString() },
          { label: "Reply rate", value: `${stats.replyRate}%` },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      <Tabs
        tabs={[
          { id: "sequences", label: "Sequences", icon: <Rocket className="h-4 w-4" /> },
          { id: "linkedin", label: "LinkedIn Accounts", icon: <Linkedin className="h-4 w-4" /> },
          { id: "email", label: "Email Accounts", icon: <Mail className="h-4 w-4" /> },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === "sequences" && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <div className="flex-1 max-w-md">
              <Input leftIcon={<Search className="h-4 w-4" />} placeholder="Search sequences..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-semibold">Sequence</th>
                  <th className="px-4 py-3 font-semibold">Channels</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Enrolled</th>
                  <th className="px-4 py-3 font-semibold">Sent</th>
                  <th className="px-4 py-3 font-semibold">Replies</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-500">No sequences yet. Click <strong>New Sequence</strong> to build one.</td></tr>
                )}
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/outreach/builder?id=${s.id}`} className="block group">
                        <p className="font-medium text-slate-900 group-hover:text-blue-600">{s.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Modified {formatDate(s.updated_at)}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3"><ChannelBadges channel={s.channel} /></td>
                    <td className="px-4 py-3"><Badge variant={statusVariant[s.status] || "default"}>{s.status}</Badge></td>
                    <td className="px-4 py-3 text-slate-600">{s.enrolled_count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">{s.sent_count.toLocaleString()}</td>
                    <td className="px-4 py-3"><span className="text-emerald-700 font-medium">{s.reply_count.toLocaleString()}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setEnrollFor(s)} disabled={pending}>
                          <UserPlus className="h-4 w-4" /> Enroll
                        </Button>
                        {s.status === "Active" ? (
                          <Button variant="ghost" size="icon" title="Pause" onClick={() => toggleStatus(s)} disabled={pending}><Pause className="h-4 w-4" /></Button>
                        ) : s.status === "Paused" ? (
                          <Button variant="ghost" size="icon" title="Resume" onClick={() => toggleStatus(s)} disabled={pending}><Play className="h-4 w-4" /></Button>
                        ) : null}
                        <div className="relative" ref={openId === s.id ? menuRef : undefined}>
                          <button className="p-1.5 rounded-md hover:bg-slate-100" onClick={(e) => openMenu(e, s.id)} aria-haspopup="menu" aria-expanded={openId === s.id}>
                            <MoreHorizontal className="h-4 w-4 text-slate-400" />
                          </button>
                          {openId === s.id && menuPos && (
                            <div
                              role="menu"
                              style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
                              className="z-50 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-sm"
                            >
                              <button className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700" onClick={() => { setOpenId(null); setActivityFor(s); }}>
                                <Eye className="h-4 w-4" /> View activity
                              </button>
                              <button className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700" onClick={() => { setOpenId(null); router.push(`/outreach/builder?id=${s.id}`); }}>
                                <Pencil className="h-4 w-4" /> Edit
                              </button>
                              <button className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700 disabled:opacity-50" onClick={() => handleDuplicate(s.id)} disabled={pending}>
                                <Copy className="h-4 w-4" /> Duplicate
                              </button>
                              <div className="my-1 border-t border-slate-100" />
                              <button className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600 disabled:opacity-50" onClick={() => { setOpenId(null); handleDelete(s.id); }} disabled={pending}>
                                <Trash2 className="h-4 w-4" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "linkedin" && (
        <AccountsTab channel="linkedin" accounts={accounts.filter((a) => a.channel === "linkedin")} unipileReady={unipileReady} />
      )}

      {tab === "email" && (
        <AccountsTab channel="email" accounts={accounts.filter((a) => a.channel === "email")} unipileReady={unipileReady} />
      )}

      {enrollFor && (
        <EnrollModal sequence={enrollFor} leads={leads} onClose={() => setEnrollFor(null)} />
      )}
      {activityFor && (
        <ActivityModal sequence={activityFor} onClose={() => setActivityFor(null)} />
      )}
    </div>
  );
}

function EnrollModal({ sequence, leads, onClose }: { sequence: OutreachSequenceRow; leads: LeadRow[]; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [result, setResult] = useState<EnrollResult | null>(null);
  const router = useRouter();

  const filtered = useMemo(
    () => leads.filter((l) => {
      const q = search.toLowerCase();
      return !q || (l.full_name || "").toLowerCase().includes(q) || (l.company_name || "").toLowerCase().includes(q) || (l.email || "").toLowerCase().includes(q);
    }),
    [leads, search]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((l) => l.id))));
  }

  function handleEnroll() {
    start(async () => {
      const res = await enrollLeads(sequence.id, [...selected]);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <Modal open onClose={onClose} title={`Enroll leads — ${sequence.name}`} description="Step 1 sends now; later steps send on schedule via the background processor. A reply stops the sequence." size="lg">
      <div className="p-5">
        {result?.ok ? (
          <div className="text-center py-8">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
            <p className="font-semibold text-slate-900">{result.enrolled} lead{result.enrolled === 1 ? "" : "s"} enrolled</p>
            <p className="text-sm text-slate-500 mt-1">{result.sent} first step{result.sent === 1 ? "" : "s"} sent now{result.failed ? ` · ${result.failed} failed` : ""}{result.skipped ? ` · ${result.skipped} already enrolled` : ""}</p>
            {result.failed > 0 && <p className="text-xs text-amber-600 mt-2">Some steps failed — usually a missing connected account or LinkedIn URL. Check the Accounts tabs.</p>}
            <Button className="mt-5" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            {result?.error && (
              <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{result.error}</span>
              </div>
            )}
            <div className="mb-3">
              <Input leftIcon={<Search className="h-4 w-4" />} placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center justify-between mb-2 px-1">
              <button className="text-sm text-blue-600 hover:underline" onClick={toggleAll}>
                {selected.size === filtered.length && filtered.length > 0 ? "Clear all" : "Select all"}
              </button>
              <span className="text-xs text-slate-500">{selected.size} selected</span>
            </div>
            <div className="border border-slate-100 rounded-lg max-h-[320px] overflow-auto divide-y divide-slate-100">
              {filtered.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No leads found.</p>}
              {filtered.map((l) => (
                <label key={l.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} className="rounded" />
                  <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0"><Users2 className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{l.full_name || l.company_name || "Unnamed lead"}</p>
                    <p className="text-xs text-slate-500 truncate">{l.email || "no email"}{l.linkedin ? " · LinkedIn ✓" : ""}</p>
                  </div>
                  <Badge variant="outline">{l.status}</Badge>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleEnroll} disabled={pending || selected.size === 0}>
                {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Enrolling...</> : <><UserPlus className="h-4 w-4" /> Enroll {selected.size || ""} lead{selected.size === 1 ? "" : "s"}</>}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

const ACTIVITY_STATUS: Record<string, "success" | "danger" | "blue" | "warning" | "default"> = {
  sent: "success",
  failed: "danger",
  replied: "blue",
  queued: "warning",
  skipped: "default",
};

function actionLabel(channel: string, action: string) {
  if (channel === "email") return "Email";
  if (action === "connection_request") return "Connection request";
  if (action === "linkedin_message") return "LinkedIn message";
  if (action === "profile_view") return "Profile view";
  if (action === "reply") return "Reply";
  return action;
}

function ActivityModal({ sequence, onClose }: { sequence: OutreachSequenceRow; onClose: () => void }) {
  const [rows, setRows] = useState<OutreachActivityFeedRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    getSequenceActivityFeed(sequence.id).then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [sequence.id]);

  return (
    <Modal open onClose={onClose} title={`Activity — ${sequence.name}`} description="What was sent to each lead, and what came back." size="lg">
      <div className="p-5">
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          <Badge variant="success">sent</Badge>
          <Badge variant="blue">replied</Badge>
          <Badge variant="warning">queued</Badge>
          <Badge variant="default">skipped</Badge>
          <Badge variant="danger">failed</Badge>
        </div>
        {rows === null ? (
          <div className="py-12 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">No activity yet. Enroll a lead to start sending.</p>
        ) : (
          <div className="border border-slate-100 rounded-lg divide-y divide-slate-100 max-h-[420px] overflow-auto">
            {rows.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${a.channel === "email" ? "bg-blue-50 text-blue-600" : "bg-cyan-50 text-cyan-600"}`}>
                  {a.channel === "email" ? <Mail className="h-4 w-4" /> : <Linkedin className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900 truncate">{a.lead_name}</p>
                    <span className="text-xs text-slate-400">· {actionLabel(a.channel, a.action)}</span>
                  </div>
                  {a.detail && <p className="text-xs text-slate-500 truncate">{a.detail}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <Badge variant={ACTIVITY_STATUS[a.status] || "default"}>{a.status}</Badge>
                  <p className="text-[11px] text-slate-400 mt-0.5">{formatDateTime(a.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-4 leading-relaxed">
          Status reflects what the provider confirmed: <strong>sent</strong> = delivered to LinkedIn/email, <strong>replied</strong> = the lead responded (sequence auto-stops), <strong>failed</strong> = rejected (reason shown). Email <em>open</em> tracking isn&apos;t enabled yet — ask to add a tracking pixel if you want opens.
        </p>
      </div>
    </Modal>
  );
}

function AccountsTab({ channel, accounts, unipileReady }: {
  channel: "email" | "linkedin";
  accounts: OutreachAccountRow[];
  unipileReady: boolean;
}) {
  const { confirm } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isLinkedIn = channel === "linkedin";

  function handleConnect() {
    setError(null);
    start(async () => {
      const res = await connectOutreachAccount(channel);
      if (res.ok && res.url) window.location.href = res.url;
      else setError(res.error || "Could not start the connect flow");
    });
  }
  function handleSync() {
    setError(null);
    start(async () => { const r = await syncOutreachAccounts(); if (!r.ok) setError(r.error || "Sync failed"); });
  }
  async function handleRemove(id: string) {
    if (!(await confirm({ title: "Disconnect account?", message: "Disconnect this account?", confirmLabel: "Disconnect", danger: true }))) return;
    start(async () => { await deleteOutreachAccount(id); });
  }

  return (
    <Card className="p-5">
      {!unipileReady && (
        <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>Unipile isn&apos;t configured yet. Add <code>UNIPILE_DSN</code> and <code>UNIPILE_API_KEY</code> to your environment to connect real accounts. {channel === "email" ? "Until then, email steps fall back to Resend." : "Until then, LinkedIn steps can't send."}</span>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{error}</span>
        </div>
      )}
      <div className="space-y-3">
        {accounts.length === 0 && (
          <p className="text-sm text-slate-500 py-4 text-center">No {isLinkedIn ? "LinkedIn" : "email"} accounts connected yet.</p>
        )}
        {accounts.map((a) => (
          <div key={a.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:bg-slate-50">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isLinkedIn ? "bg-cyan-50 text-cyan-600" : "bg-blue-50 text-blue-600"}`}>
                {isLinkedIn ? <Linkedin className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
              </div>
              <div>
                <p className="font-medium text-slate-900">{a.identifier || a.name || a.account_id}</p>
                <p className="text-xs text-slate-500">{a.name || (isLinkedIn ? "LinkedIn account" : "Mailbox")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={a.status === "connected" ? "success" : "warning"}>{a.status}</Badge>
              <Button variant="ghost" size="icon" onClick={() => handleRemove(a.id)} disabled={pending}><Trash2 className="h-4 w-4 text-red-500" /></Button>
            </div>
          </div>
        ))}

        <div className="flex items-center gap-2">
          <Button variant="outline" className="flex-1" onClick={handleConnect} disabled={pending || !unipileReady}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Connect {isLinkedIn ? "a LinkedIn account" : "an email account"}
          </Button>
          <Button variant="ghost" onClick={handleSync} disabled={pending || !unipileReady} title="Refresh from Unipile">
            <RefreshCw className="h-4 w-4" /> Sync
          </Button>
        </div>
        {isLinkedIn && (
          <p className="text-xs text-slate-400 leading-relaxed">
            LinkedIn has no official outreach API. Unipile manages the session + a dedicated proxy per account, with
            human-like daily limits to keep accounts safe.
          </p>
        )}
      </div>
    </Card>
  );
}
