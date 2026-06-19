"use client";
import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, MoreHorizontal, Mail, Rocket, Pause, Play, Copy, Trash2, Pencil, Search, LayoutTemplate, ChevronDown, Megaphone, Link2 } from "lucide-react";
import { ConnectionsModal } from "@/components/campaigns/connections-modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useFeedback } from "@/components/ui/feedback";
import { setCampaignStatus, deleteCampaign, duplicateCampaign, type CampaignRow } from "@/lib/queries/campaigns";
import { setSequenceStatus, deleteSequence, duplicateSequence, type OutreachSequenceRow } from "@/lib/queries/outreach";
import { campaignTemplates } from "@/lib/campaign-templates";
import { formatDate, cn } from "@/lib/utils";

interface UnifiedRow {
  id: string;
  name: string;
  kind: "email" | "sequence";
  channel?: string;
  status: string;
  leads: number | null;
  sent: number;
  openRate: number | null;
  replyRate: number;
  updatedAt: string;
  href: string;
}

export function CampaignsView({
  campaigns,
  sequences,
  cStats,
  sStats,
}: {
  campaigns: CampaignRow[];
  sequences: OutreachSequenceRow[];
  cStats: { active: number; totalSent: number; avgOpen: number; avgReply: number };
  sStats: { active: number; enrolled: number; sent: number; replyRate: number };
}) {
  const { confirm } = useFeedback();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
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

  const rows: UnifiedRow[] = [
    ...campaigns.map((c): UnifiedRow => ({
      id: c.id,
      name: c.campaign_name,
      kind: "email",
      status: c.status,
      leads: null,
      sent: c.sent_count || 0,
      openRate: Number(c.open_rate || 0),
      replyRate: Number(c.reply_rate || 0),
      updatedAt: c.updated_at,
      href: `/campaigns/${c.id}`,
    })),
    ...sequences.map((s): UnifiedRow => ({
      id: s.id,
      name: s.name,
      kind: "sequence",
      channel: s.channel,
      status: s.status,
      leads: s.enrolled_count || 0,
      sent: s.sent_count || 0,
      openRate: null,
      replyRate: s.sent_count ? Math.round((s.reply_count / s.sent_count) * 1000) / 10 : 0,
      updatedAt: s.updated_at,
      href: `/outreach/builder?id=${s.id}`,
    })),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const hasAny = rows.length > 0;
  const filtered = rows.filter((r) => {
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase());
    const matchActive = !activeOnly || r.status === "Active";
    return matchSearch && matchActive;
  });

  function progressPct(r: UnifiedRow): number {
    if (r.kind === "sequence" && r.leads) return Math.min(100, Math.round((r.sent / Math.max(1, r.leads)) * 100));
    if (r.status === "Completed") return 100;
    if (r.status === "Active") return 50;
    return 0;
  }

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
          <>
            {/* Column header (desktop) — Dripify layout: Overview · Leads · LinkedIn · Status */}
            <div className="hidden lg:grid grid-cols-[2fr_1.2fr_1.2fr_auto] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span>Overview</span>
              <span>Leads</span>
              <span>Performance</span>
              <span className="text-right pr-2">Status</span>
            </div>

            <ul className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <li className="px-5 py-12 text-center text-slate-500 text-sm">No campaigns match your filters.</li>
              )}
              {filtered.map((r) => {
                const isActive = r.status === "Active";
                const pct = progressPct(r);
                return (
                  <li key={`${r.kind}-${r.id}`} className="px-5 py-4 hover:bg-slate-50/60 transition-colors">
                    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1.2fr_1.2fr_auto] gap-4 lg:items-center">
                      {/* Overview */}
                      <div className="min-w-0">
                        <Link href={r.href} className="flex items-center gap-3 group">
                          <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${r.kind === "email" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"}`}>
                            {r.kind === "email" ? <Mail className="h-4.5 w-4.5" /> : <Rocket className="h-4.5 w-4.5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 group-hover:text-blue-600 truncate">{r.name}</p>
                            <p className="text-xs text-slate-400">{r.kind === "email" ? "Email campaign" : `Sequence · ${r.channel}`} · {formatDate(r.updatedAt)}</p>
                          </div>
                        </Link>
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${isActive ? "bg-blue-500" : r.status === "Completed" ? "bg-emerald-500" : "bg-slate-300"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-slate-400 tabular-nums">{r.leads === null ? r.sent.toLocaleString() : r.leads.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Leads */}
                      <div className="text-sm">
                        <div className="flex items-center justify-between max-w-[160px]">
                          <span className="text-slate-500">{r.kind === "sequence" ? "Enrolled" : "Recipients"}</span>
                          <span className="font-semibold text-slate-900">{r.leads === null ? "—" : r.leads.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between max-w-[160px] mt-1">
                          <span className="text-slate-500">Sent</span>
                          <span className="font-semibold text-slate-900">{r.sent.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Performance */}
                      <div className="text-sm">
                        <div className="flex items-center justify-between max-w-[160px]">
                          <span className="text-slate-500">{r.kind === "email" ? "Open rate" : "Acceptance"}</span>
                          <span className="font-semibold text-slate-900">{r.openRate === null ? "—" : `${r.openRate}%`}</span>
                        </div>
                        <div className="flex items-center justify-between max-w-[160px] mt-1">
                          <span className="text-slate-500">Reply rate</span>
                          <span className="font-semibold text-emerald-700">{r.replyRate}%</span>
                        </div>
                      </div>

                      {/* Status */}
                      <div className="flex items-center justify-between lg:justify-end gap-3 lg:flex-col lg:items-end lg:gap-1.5">
                        <div className="flex items-center gap-2">
                          <button
                            role="switch"
                            aria-checked={isActive}
                            aria-label={isActive ? "Pause campaign" : "Activate campaign"}
                            onClick={() => toggleStatus(r)}
                            disabled={pending}
                            className={cn("relative h-6 w-11 rounded-full transition-colors flex-shrink-0", isActive ? "bg-blue-600" : "bg-slate-300")}
                          >
                            <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", isActive ? "translate-x-5" : "translate-x-0")} />
                          </button>
                          <span className="text-xs text-slate-400 lg:hidden">{formatDate(r.updatedAt)}</span>
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
                                <button onClick={() => handleDelete(r)} disabled={pending} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50">
                                  <Trash2 className="h-4 w-4" /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="hidden lg:block text-xs text-slate-400">{formatDate(r.updatedAt)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <ConnectionsModal open={connectionsOpen} onClose={() => setConnectionsOpen(false)} />
    </div>
  );
}
