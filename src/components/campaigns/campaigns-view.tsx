"use client";
import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, MoreHorizontal, Pause, Play, Copy, Trash2, Pencil, Search, LayoutTemplate, ChevronDown, ChevronRight, Megaphone, Link2, Send, CheckCircle2, Undo2, Archive } from "lucide-react";
import { ConnectionsModal } from "@/components/campaigns/connections-modal";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { useFeedback } from "@/components/ui/feedback";
import { setCampaignStatus, deleteCampaign, duplicateCampaign, type CampaignRow } from "@/lib/queries/campaigns";
import { setSequenceStatus, deleteSequence, duplicateSequence, type OutreachSequenceRow } from "@/lib/queries/outreach";
import { submitForReview, approveCampaign, sendBackToDraft, archiveCampaign } from "@/lib/queries/campaign-approval";
import { APPROVAL_STATUSES, approvalBadgeVariant } from "@/lib/campaign-approval-ui";
import { campaignTemplates } from "@/lib/campaign-templates";
import { formatDate } from "@/lib/utils";

interface UnifiedRow {
  id: string;
  name: string;
  kind: "email" | "sequence";
  channel?: string;
  status: string;
  approvalStatus: string | null; // email campaigns only — sequences aren't in scope for this lifecycle
  leads: number | null;
  sent: number;
  replyRate: number;
  bounceRate: number | null;
  ownerId: string | null;
  updatedAt: string;
  href: string;
}

export function CampaignsView({
  campaigns,
  sequences,
  cStats,
  sStats,
  isApprover,
  segments,
  totalLeads,
  owners,
}: {
  campaigns: CampaignRow[];
  sequences: OutreachSequenceRow[];
  cStats: { active: number; totalSent: number; avgOpen: number; avgReply: number };
  sStats: { active: number; enrolled: number; sent: number; replyRate: number };
  segments: { id: string; contacts: number }[];
  totalLeads: number;
  isApprover: boolean;
  owners: Record<string, string>;
}) {
  const { confirm, toast } = useFeedback();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [approvalFilter, setApprovalFilter] = useState("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const tplRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (openId && menuRef.current && !menuRef.current.contains(t)) setOpenId(null);
      if (templatesOpen && tplRef.current && !tplRef.current.contains(t)) setTemplatesOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openId, templatesOpen]);

  const segmentContacts = new Map(segments.map((s) => [s.id, s.contacts]));

  const rows: UnifiedRow[] = [
    ...campaigns.map((c): UnifiedRow => ({
      id: c.id,
      name: c.campaign_name,
      kind: "email",
      status: c.status,
      approvalStatus: c.approval_status,
      leads: c.segment_id ? (segmentContacts.get(c.segment_id) ?? 0) : totalLeads,
      sent: c.sent_count || 0,
      replyRate: Number(c.reply_rate || 0),
      bounceRate: Number(c.bounce_rate || 0),
      ownerId: c.created_by,
      updatedAt: c.updated_at,
      href: `/campaigns/${c.id}`,
    })),
    ...sequences.map((s): UnifiedRow => ({
      id: s.id,
      name: s.name,
      kind: "sequence",
      channel: s.channel,
      status: s.status,
      approvalStatus: null,
      leads: s.enrolled_count || 0,
      sent: s.sent_count || 0,
      replyRate: s.sent_count ? Math.round((s.reply_count / s.sent_count) * 1000) / 10 : 0,
      bounceRate: null,
      ownerId: s.created_by,
      updatedAt: s.updated_at,
      href: `/outreach/builder?id=${s.id}`,
    })),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const hasAny = rows.length > 0;
  const filtered = rows.filter((r) => {
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase());
    const matchActive = !activeOnly || r.status === "Active";
    const matchApproval = approvalFilter === "All" || r.approvalStatus === approvalFilter;
    return matchSearch && matchActive && matchApproval;
  });

  function toggleStatus(r: UnifiedRow) {
    setOpenId(null);
    const next = r.status === "Active" ? "Paused" : "Active";
    start(async () => {
      if (r.kind === "email") await setCampaignStatus(r.id, next);
      else await setSequenceStatus(r.id, next);
    });
  }
  async function handleDelete(r: UnifiedRow) {
    setOpenId(null);
    if (!(await confirm({ title: "Delete campaign?", message: `Delete “${r.name}”? This can't be undone.`, confirmLabel: "Delete", danger: true }))) return;
    start(async () => {
      if (r.kind === "email") await deleteCampaign(r.id);
      else await deleteSequence(r.id);
    });
  }
  function handleDuplicate(r: UnifiedRow) {
    setOpenId(null);
    start(async () => {
      if (r.kind === "email") await duplicateCampaign(r.id);
      else await duplicateSequence(r.id);
    });
  }

  function handleSubmitForReview(r: UnifiedRow) {
    setOpenId(null);
    start(async () => {
      try {
        await submitForReview(r.id);
        toast("Submitted for review.", "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Couldn't submit for review.", "error");
      }
    });
  }
  function handleApprove(r: UnifiedRow) {
    setOpenId(null);
    start(async () => {
      try {
        await approveCampaign(r.id);
        toast("Campaign approved.", "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Couldn't approve campaign.", "error");
      }
    });
  }
  function handleSendBack(r: UnifiedRow) {
    setOpenId(null);
    const comment = window.prompt(`Why is "${r.name}" being sent back to draft?`);
    if (comment === null) return;
    start(async () => {
      try {
        await sendBackToDraft(r.id, comment);
        toast("Sent back to draft.", "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Couldn't send campaign back.", "error");
      }
    });
  }
  function handleArchive(r: UnifiedRow) {
    setOpenId(null);
    start(async () => {
      try {
        await archiveCampaign(r.id);
        toast("Campaign archived.", "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Couldn't archive campaign.", "error");
      }
    });
  }

  const statCards = [
    { label: "Active campaigns", value: cStats.active + sStats.active },
    { label: "Messages sent", value: (cStats.totalSent + sStats.sent).toLocaleString() },
    { label: "Avg. open rate", value: `${cStats.avgOpen}%` },
    { label: "Avg. reply rate", value: `${cStats.avgReply || sStats.replyRate}%` },
  ];

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="Campaigns"
        description="Create, launch and track your outreach — email or multichannel."
        actions={
          <>
            <Button variant="outline" onClick={() => setConnectionsOpen(true)}>
              <Link2 className="h-4 w-4" /> Connections
            </Button>
            <Link href="/campaigns/builder">
              <Button><Plus className="h-4 w-4" /> New Campaign</Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {statCards.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-visible">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] max-w-sm">
            <Input
              leftIcon={<Search className="h-4 w-4" />}
              placeholder="Search campaigns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Active only
          </label>
          <Select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)} className="w-auto max-w-[200px]">
            <option value="All">All approval stages</option>
            {APPROVAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>

          <div className="ml-auto flex items-center gap-2">
            {/* Templates dropdown */}
            <div className="relative" ref={tplRef}>
              <Button variant="outline" onClick={() => setTemplatesOpen((v) => !v)}>
                <LayoutTemplate className="h-4 w-4" /> Templates <ChevronDown className={`h-3.5 w-3.5 transition-transform ${templatesOpen ? "rotate-180" : ""}`} />
              </Button>
              {templatesOpen && (
                <div className="lp-anim-pop origin-top-right absolute right-0 top-full mt-1 z-20 w-72 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden p-1">
                  <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Start from a template</p>
                  <div className="max-h-80 overflow-y-auto">
                    {campaignTemplates.map((t) => {
                      const Icon = t.icon;
                      return (
                        <button
                          key={t.id}
                          onClick={() => { setTemplatesOpen(false); router.push(`/campaigns/builder?template=${t.id}`); }}
                          className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-50"
                        >
                          <span className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${t.accent}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-slate-900">{t.name} <span className="text-[11px] font-normal text-slate-400">· {t.steps.length} steps</span></span>
                            <span className="block text-xs text-slate-500 line-clamp-1">{t.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <Link href="/campaigns/builder" onClick={() => setTemplatesOpen(false)} className="block px-3 py-2 mt-1 border-t border-slate-100 text-sm font-medium text-blue-600 hover:bg-slate-50">
                    Start blank →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Empty state */}
        {!hasAny ? (
          <div className="px-4 py-20 text-center">
            <div className="h-14 w-14 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
              <Megaphone className="h-7 w-7" />
            </div>
            <p className="text-slate-900 font-semibold">You currently have no campaigns</p>
            <p className="text-sm text-slate-500 mt-1 mb-5">Create your first campaign or start from a template.</p>
            <Link href="/campaigns/builder"><Button><Plus className="h-4 w-4" /> Create campaign</Button></Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[880px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Leads</th>
                  <th className="px-3 py-3 font-semibold">Sent</th>
                  <th className="px-3 py-3 font-semibold">Reply rate</th>
                  <th className="px-3 py-3 font-semibold">Bounce rate</th>
                  <th className="px-3 py-3 font-semibold">Owner</th>
                  <th className="px-3 py-3 font-semibold">Last modified</th>
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="px-5 py-12 text-center text-slate-500 text-sm">No campaigns match your filters.</td></tr>
                )}
                {filtered.map((r) => {
                  const isActive = r.status === "Active";
                  const ownerName = r.ownerId ? owners[r.ownerId] : null;
                  return (
                    <tr key={`${r.kind}-${r.id}`} onClick={() => router.push(r.href)} className="cursor-pointer hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <ChevronRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
                          <span className="font-medium text-slate-900 truncate">{r.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {r.approvalStatus ? (
                          <Badge variant={approvalBadgeVariant(r.approvalStatus)}>{r.approvalStatus}</Badge>
                        ) : (
                          <Badge variant={isActive ? "success" : "default"}>{r.status}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{r.leads === null ? "—" : r.leads.toLocaleString()}</td>
                      <td className="px-3 py-3 text-slate-600">{r.sent ? r.sent.toLocaleString() : "—"}</td>
                      <td className="px-3 py-3 text-slate-600">{r.sent ? `${r.replyRate}%` : "—"}</td>
                      <td className="px-3 py-3 text-slate-600">{r.bounceRate === null ? "—" : r.sent ? `${r.bounceRate}%` : "—"}</td>
                      <td className="px-3 py-3">
                        {ownerName ? (
                          <span className="inline-flex items-center gap-2 text-slate-700">
                            <span className="h-6 w-6 rounded-full bg-blue-600 text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                              {ownerName.charAt(0).toUpperCase()}
                            </span>
                            <span className="truncate max-w-[140px]">{ownerName}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{formatDate(r.updatedAt)}</td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="relative" ref={openId === r.id ? menuRef : undefined}>
                          <button onClick={() => setOpenId(openId === r.id ? null : r.id)} aria-label="Campaign actions" className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {openId === r.id && (
                            <div className="lp-anim-pop origin-top-right absolute right-0 top-full mt-1 z-20 w-44 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden p-1">
                              <Link href={r.href} onClick={() => setOpenId(null)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                                <Pencil className="h-4 w-4 text-slate-400" /> Edit
                              </Link>
                              <button onClick={() => toggleStatus(r)} disabled={pending} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                                {isActive ? <><Pause className="h-4 w-4 text-slate-400" /> Pause</> : <><Play className="h-4 w-4 text-slate-400" /> Resume</>}
                              </button>
                              <button onClick={() => handleDuplicate(r)} disabled={pending} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                                <Copy className="h-4 w-4 text-slate-400" /> Duplicate
                              </button>
                              {r.approvalStatus === "Draft (AI-generated)" && (
                                <button onClick={() => handleSubmitForReview(r)} disabled={pending} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                                  <Send className="h-4 w-4 text-slate-400" /> Submit for review
                                </button>
                              )}
                              {r.approvalStatus === "Pending review" && isApprover && (
                                <>
                                  <button onClick={() => handleApprove(r)} disabled={pending} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-emerald-700 hover:bg-emerald-50">
                                    <CheckCircle2 className="h-4 w-4" /> Approve
                                  </button>
                                  <button onClick={() => handleSendBack(r)} disabled={pending} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                                    <Undo2 className="h-4 w-4 text-slate-400" /> Send back
                                  </button>
                                </>
                              )}
                              {(r.approvalStatus === "Approved" || r.approvalStatus === "Live/Distributing") && (
                                <button onClick={() => handleArchive(r)} disabled={pending} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                                  <Archive className="h-4 w-4 text-slate-400" /> Archive
                                </button>
                              )}
                              <button onClick={() => handleDelete(r)} disabled={pending} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50">
                                <Trash2 className="h-4 w-4" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConnectionsModal open={connectionsOpen} onClose={() => setConnectionsOpen(false)} />
    </div>
  );
}
