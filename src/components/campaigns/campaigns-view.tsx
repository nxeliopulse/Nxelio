"use client";
import { useState, useTransition, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, MoreHorizontal, Pause, Play, Copy, Trash2, Pencil, Search, LayoutTemplate, ChevronDown, ChevronRight, Megaphone, Link2, Send, CheckCircle2, Undo2, Archive, Star, LayoutGrid, List, Columns3, ArrowUp, ArrowDown, ArrowUpDown, Eye, MessageSquare, Filter as FilterIcon, X } from "lucide-react";
import { ConnectionsModal } from "@/components/campaigns/connections-modal";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  channelLabel: "Email" | "LinkedIn" | "Multichannel";
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

/** A campaign's own step content decides its channel — multichannel sequences
 *  embed LinkedIn steps as "[li:...]" header markers alongside plain email
 *  steps (see parseCampaignSteps in campaign-scheduler.ts), so a campaign with
 *  both kinds of step is genuinely multichannel, not just "email". */
function campaignChannelLabel(content: string | null): "Email" | "LinkedIn" | "Multichannel" {
  if (!content || !content.trim()) return "Email";
  const blocks = content.split(/\n+\s*---\s*\n+/);
  let hasLinkedIn = false, hasEmail = false;
  for (const block of blocks) {
    const header = (block.trim().split("\n")[0] || "");
    if (/\[li:(connection_request|linkedin_message|message)\]/i.test(header)) hasLinkedIn = true;
    else hasEmail = true;
  }
  if (hasLinkedIn && hasEmail) return "Multichannel";
  return hasLinkedIn ? "LinkedIn" : "Email";
}

function ChannelBadge({ label }: { label: "Email" | "LinkedIn" | "Multichannel" }) {
  const variant = label === "LinkedIn" ? "blue" : label === "Multichannel" ? "purple" : "info";
  return <Badge variant={variant}>{label}</Badge>;
}

// Solid-colored status pill matching the reference design — kept local to this
// table instead of changing the shared (subtle-toned) Badge component used elsewhere.
function StatusPill({ label, tone }: { label: string; tone: "success" | "warning" | "danger" | "info" | "default" }) {
  const toneClass = {
    success: "bg-emerald-500 text-white",
    warning: "bg-amber-500 text-white",
    danger: "bg-red-500 text-white",
    info: "bg-blue-500 text-white",
    default: "bg-slate-400 text-white",
  }[tone];
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${toneClass}`}>{label}</span>;
}

function statusPillTone(status: string): "success" | "warning" | "danger" | "info" | "default" {
  switch (status) {
    case "Approved": case "Active": return "success";
    case "Pending review": return "warning";
    case "Archived": return "default";
    case "Live/Distributing": return "info";
    default: return "default"; // Draft (AI-generated), Paused
  }
}

type SortField = "updatedAt" | "name" | "leads" | "sent" | "replyRate" | "bounceRate";

function SortTh({ label, field, defaultDir = "desc", sortField, sortDir, onSort }: {
  label: string;
  field: SortField;
  defaultDir?: "asc" | "desc";
  sortField: SortField;
  sortDir: "asc" | "desc";
  onSort: (field: SortField, defaultDir: "asc" | "desc") => void;
}) {
  const active = sortField === field;
  return (
    <th className="px-3 py-3 font-semibold">
      <button onClick={() => onSort(field, defaultDir)} className="inline-flex items-center gap-1 hover:text-slate-700">
        {label}
        {active ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
      </button>
    </th>
  );
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
  const { confirm, toast, prompt } = useFeedback();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [approvalFilter, setApprovalFilter] = useState("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  function toggleSort(field: SortField, defaultDir: "asc" | "desc" = "desc") {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir(defaultDir); }
  }
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string[]>([]); // channel labels; empty = all
  function toggleTypeFilter(t: string) {
    setTypeFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }
  function resetFilters() {
    setSearch(""); setActiveOnly(false); setApprovalFilter("All"); setTypeFilter([]); setDateFrom(""); setDateTo("");
  }
  const activeFilterCount = (search ? 1 : 0) + (activeOnly ? 1 : 0) + (approvalFilter !== "All" ? 1 : 0) + (typeFilter.length > 0 ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);
  const [visibleCols, setVisibleCols] = useState({
    status: true,
    leads: true,
    sent: true,
    replyRate: true,
    bounceRate: true,
    owner: true,
    lastModified: true,
  });
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement | null>(null);
  const tplRef = useRef<HTMLDivElement | null>(null);
  const colsRef = useRef<HTMLDivElement | null>(null);
  const filterRef = useRef<HTMLDivElement | null>(null);

  // Favorites are per-browser only — campaigns have no "favorite" column in the DB.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("lp-campaigns-favorites") || "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(saved)) setFavorites(new Set(saved));
    } catch { /* ignore malformed storage */ }
  }, []);
  function toggleFavorite(key: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem("lp-campaigns-favorites", JSON.stringify([...next]));
      return next;
    });
  }
  function toggleColumn(key: keyof typeof visibleCols) {
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (openId && menuRef.current && !menuRef.current.contains(t)) setOpenId(null);
      if (templatesOpen && tplRef.current && !tplRef.current.contains(t)) setTemplatesOpen(false);
      if (columnsOpen && colsRef.current && !colsRef.current.contains(t)) setColumnsOpen(false);
      if (filterOpen && filterRef.current && !filterRef.current.contains(t)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openId, templatesOpen, columnsOpen, filterOpen]);

  // Table rows paint over each other's overflowing content, so the row-action menu is
  // rendered in a portal instead — close it on scroll since its position is fixed at open time.
  useEffect(() => {
    if (!openId) return;
    function onScroll() { setOpenId(null); }
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [openId]);

  const segmentContacts = new Map(segments.map((s) => [s.id, s.contacts]));

  const rows: UnifiedRow[] = [
    ...campaigns.map((c): UnifiedRow => ({
      id: c.id,
      name: c.campaign_name,
      kind: "email",
      channelLabel: campaignChannelLabel(c.content),
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
      channelLabel: s.channel === "linkedin" ? "LinkedIn" : s.channel === "multichannel" ? "Multichannel" : "Email",
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
  const filtered = rows
    .filter((r) => {
      const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase());
      const matchActive = !activeOnly || r.status === "Active";
      const matchApproval = approvalFilter === "All" || r.approvalStatus === approvalFilter;
      const matchDateFrom = !dateFrom || r.updatedAt >= dateFrom;
      const matchDateTo = !dateTo || r.updatedAt <= `${dateTo}T23:59:59.999Z`;
      const matchType = typeFilter.length === 0 || typeFilter.includes(r.channelLabel);
      return matchSearch && matchActive && matchApproval && matchDateFrom && matchDateTo && matchType;
    })
    .sort((a, b) => {
      let cmp: number;
      switch (sortField) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "leads": cmp = (a.leads ?? 0) - (b.leads ?? 0); break;
        case "sent": cmp = a.sent - b.sent; break;
        case "replyRate": cmp = a.replyRate - b.replyRate; break;
        case "bounceRate": cmp = (a.bounceRate ?? 0) - (b.bounceRate ?? 0); break;
        default: cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  const rowKey = (r: UnifiedRow) => `${r.kind}-${r.id}`;
  const toggleSelected = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((x) => x !== key) : [...s, key]));
  const toggleSelectAll = () =>
    setSelected(selected.length === filtered.length ? [] : filtered.map(rowKey));
  const selectedRows = filtered.filter((r) => selected.includes(rowKey(r)));
  // Only rows an approver can actually approve — bulk-approve silently skips the rest.
  const selectedApprovable = selectedRows.filter((r) => r.kind === "email" && r.approvalStatus === "Pending review" && isApprover);

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
  async function handleSendBack(r: UnifiedRow) {
    setOpenId(null);
    const comment = await prompt({
      title: "Send back to draft",
      message: `Why is "${r.name}" being sent back to draft?`,
      label: "Reason",
      placeholder: "e.g. Needs a subject line change",
      confirmLabel: "Send back",
      required: true,
    });
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

  function handleBulkApprove() {
    const ids = selectedApprovable.map((r) => r.id);
    if (!ids.length) return;
    start(async () => {
      const results = await Promise.allSettled(ids.map((id) => approveCampaign(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      setSelected([]);
      if (failed) toast(`Approved ${ids.length - failed} of ${ids.length} — ${failed} failed.`, failed === ids.length ? "error" : "info");
      else toast(`${ids.length} campaign${ids.length === 1 ? "" : "s"} approved.`, "success");
    });
  }

  async function handleBulkDelete() {
    if (!(await confirm({ title: "Delete campaigns?", message: `Delete ${selectedRows.length} item(s)? This can't be undone.`, confirmLabel: "Delete", danger: true }))) return;
    const rowsToDelete = selectedRows;
    setSelected([]);
    start(async () => {
      await Promise.allSettled(rowsToDelete.map((r) => (r.kind === "email" ? deleteCampaign(r.id) : deleteSequence(r.id))));
    });
  }

  const statCards = [
    { label: "Active campaigns", value: cStats.active + sStats.active, icon: Megaphone, accent: "bg-amber-500" },
    { label: "Messages sent", value: (cStats.totalSent + sStats.sent).toLocaleString(), icon: Send, accent: "bg-blue-500" },
    { label: "Avg. open rate", value: `${cStats.avgOpen}%`, icon: Eye, accent: "bg-rose-500" },
    { label: "Avg. reply rate", value: `${cStats.avgReply || sStats.replyRate}%`, icon: MessageSquare, accent: "bg-emerald-500" },
  ];

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Custom header (breadcrumb + count badge) — kept local to this page, doesn't touch the shared PageHeader used elsewhere */}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Campaigns</h1>
            <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold">
              {rows.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
            <span>Home</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-600 font-medium">Campaigns</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setConnectionsOpen(true)}>
            <Link2 className="h-4 w-4" /> Connections
          </Button>
          <Link href="/campaigns/builder">
            <Button><Plus className="h-4 w-4" /> New Campaign</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-4 sm:p-5 flex items-center gap-3">
              <span className={`h-11 w-11 rounded-full ${s.accent} text-white flex items-center justify-center flex-shrink-0`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 truncate">{s.label}</p>
                <p className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">{s.value}</p>
              </div>
            </Card>
          );
        })}
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
        </div>

        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <Select
            value={`${sortField}:${sortDir}`}
            onChange={(e) => { const [f, d] = e.target.value.split(":"); setSortField(f as SortField); setSortDir(d as "asc" | "desc"); }}
            className="w-auto max-w-[190px]"
          >
            <option value="updatedAt:desc">Sort: Newest first</option>
            <option value="updatedAt:asc">Sort: Oldest first</option>
            <option value="name:asc">Sort: Name A-Z</option>
            <option value="leads:desc">Sort: Most leads</option>
            <option value="sent:desc">Sort: Most sent</option>
            <option value="replyRate:desc">Sort: Best reply rate</option>
          </Select>

          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || undefined}
              className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Last modified from"
            />
            <span className="text-slate-400">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Last modified to"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Filter dropdown — consolidates search/status/type/date into one panel;
                each field mirrors the standalone controls above, so both stay in sync. */}
            <div className="relative" ref={filterRef}>
              <Button variant="outline" onClick={() => setFilterOpen((v) => !v)}>
                <FilterIcon className="h-4 w-4" /> Filter
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filterOpen ? "rotate-180" : ""}`} />
              </Button>
              {filterOpen && (
                <div className="lp-anim-pop origin-top-right absolute right-0 top-full mt-1 z-20 w-72 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900"><FilterIcon className="h-4 w-4" /> Filter</span>
                    <button onClick={() => setFilterOpen(false)} aria-label="Close" className="p-1 rounded-md hover:bg-slate-100 text-slate-400">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">Name</p>
                      <Input
                        leftIcon={<Search className="h-4 w-4" />}
                        placeholder="Search campaigns..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">Type</p>
                      <div className="flex flex-col gap-1.5">
                        {(["Email", "LinkedIn", "Multichannel"] as const).map((t) => (
                          <label key={t} className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={typeFilter.includes(t)}
                              onChange={() => toggleTypeFilter(t)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            {t}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">Start date</p>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        max={dateTo || undefined}
                        className="w-full h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">End date</p>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        min={dateFrom || undefined}
                        className="w-full h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">Status</p>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none mb-2">
                        <input
                          type="checkbox"
                          checked={activeOnly}
                          onChange={(e) => setActiveOnly(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        Active only
                      </label>
                      <Select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)}>
                        <option value="All">All approval stages</option>
                        {APPROVAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-3 border-t border-slate-100">
                    <Button variant="outline" className="flex-1" onClick={resetFilters}>Reset</Button>
                    <Button className="flex-1" onClick={() => setFilterOpen(false)}>Filter</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Manage Columns dropdown — list view only */}
            {viewMode === "list" && (
              <div className="relative" ref={colsRef}>
                <button
                  onClick={() => setColumnsOpen((v) => !v)}
                  className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-lg border text-sm font-medium transition-colors ${
                    columnsOpen ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-indigo-50/60 border-indigo-100 text-indigo-600 hover:bg-indigo-50"
                  }`}
                >
                  <Columns3 className="h-4 w-4" /> Manage Columns
                </button>
                {columnsOpen && (
                  <div className="lp-anim-pop origin-top-right absolute right-0 top-full mt-1 z-20 w-56 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden p-1">
                    <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Show columns</p>
                    {([
                      ["status", "Status"],
                      ["leads", "Leads"],
                      ["sent", "Sent"],
                      ["replyRate", "Reply rate"],
                      ["bounceRate", "Bounce rate"],
                      ["owner", "Owner"],
                      ["lastModified", "Last modified"],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={visibleCols[key]}
                          onChange={() => toggleColumn(key)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* List / grid view toggle */}
            <div className="flex items-center rounded-lg border border-slate-200 p-0.5">
              <button
                onClick={() => setViewMode("list")}
                aria-label="List view"
                className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-600"}`}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-600"}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>

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
        ) : viewMode === "grid" ? (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.length === 0 && (
              <p className="col-span-full px-1 py-12 text-center text-slate-500 text-sm">No campaigns match your filters.</p>
            )}
            {filtered.map((r) => {
              const isActive = r.status === "Active";
              const ownerName = r.ownerId ? owners[r.ownerId] : null;
              const key = rowKey(r);
              const isFav = favorites.has(key);
              return (
                <Card key={key} onClick={() => router.push(r.href)} className="p-4 cursor-pointer hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <Megaphone className="h-4 w-4" />
                      </span>
                      <span className="font-medium text-slate-900 truncate">{r.name}</span>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleFavorite(key)} aria-label="Toggle favorite" className="p-1 rounded-md hover:bg-slate-100">
                        <Star className={`h-4 w-4 ${isFav ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                      </button>
                      <button
                        onClick={(e) => {
                          if (openId === r.id) { setOpenId(null); return; }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                          setOpenId(r.id);
                        }}
                        aria-label="Campaign actions"
                        className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 mt-3">
                    <ChannelBadge label={r.channelLabel} />
                    {r.approvalStatus ? (
                      <Badge variant={approvalBadgeVariant(r.approvalStatus)}>{r.approvalStatus}</Badge>
                    ) : (
                      <Badge variant={isActive ? "success" : "default"}>{r.status}</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
                    <div><p className="text-slate-400">Leads</p><p className="font-medium text-slate-900">{r.leads === null ? "—" : r.leads.toLocaleString()}</p></div>
                    <div><p className="text-slate-400">Sent</p><p className="font-medium text-slate-900">{r.sent ? r.sent.toLocaleString() : "—"}</p></div>
                    <div><p className="text-slate-400">Reply rate</p><p className="font-medium text-slate-900">{r.sent ? `${r.replyRate}%` : "—"}</p></div>
                    <div><p className="text-slate-400">Bounce rate</p><p className="font-medium text-slate-900">{r.bounceRate === null ? "—" : r.sent ? `${r.bounceRate}%` : "—"}</p></div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                    {ownerName ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 min-w-0">
                        <span className="h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                          {ownerName.charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate max-w-[100px]">{ownerName}</span>
                      </span>
                    ) : <span />}
                    <span className="text-xs text-slate-400 whitespace-nowrap">{formatDate(r.updatedAt)}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[880px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.length === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300"
                    />
                  </th>
                  <th className="px-3 py-3 w-8" />
                  <SortTh label="Name" field="name" defaultDir="asc" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  {visibleCols.status && <th className="px-3 py-3 font-semibold">Status</th>}
                  {(visibleCols.leads || visibleCols.sent || visibleCols.replyRate || visibleCols.bounceRate) && (
                    <SortTh label="Progress" field="leads" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  )}
                  {visibleCols.owner && <th className="px-3 py-3 font-semibold">Owner</th>}
                  {visibleCols.lastModified && <SortTh label="Last modified" field="updatedAt" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />}
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 && (
                  <tr><td colSpan={
                    4
                    + (visibleCols.status ? 1 : 0)
                    + ((visibleCols.leads || visibleCols.sent || visibleCols.replyRate || visibleCols.bounceRate) ? 1 : 0)
                    + (visibleCols.owner ? 1 : 0)
                    + (visibleCols.lastModified ? 1 : 0)
                  } className="px-5 py-12 text-center text-slate-500 text-sm">No campaigns match your filters.</td></tr>
                )}
                {filtered.map((r) => {
                  const isActive = r.status === "Active";
                  const ownerName = r.ownerId ? owners[r.ownerId] : null;
                  const key = rowKey(r);
                  const isFav = favorites.has(key);
                  const canApproveHere = r.kind === "email" && r.approvalStatus === "Pending review" && isApprover;
                  return (
                    <tr key={key} onClick={() => router.push(r.href)} className="cursor-pointer hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.includes(key)}
                          onChange={() => toggleSelected(key)}
                          className="rounded border-slate-300"
                        />
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => toggleFavorite(key)} aria-label="Toggle favorite" className="p-1 rounded-md hover:bg-slate-100">
                          <Star className={`h-4 w-4 ${isFav ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <ChevronRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
                          <span className="font-medium text-slate-900 truncate">{r.name}</span>
                          <ChannelBadge label={r.channelLabel} />
                        </div>
                      </td>
                      {visibleCols.status && (
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            {r.approvalStatus ? (
                              <StatusPill label={r.approvalStatus} tone={statusPillTone(r.approvalStatus)} />
                            ) : (
                              <StatusPill label={r.status} tone={statusPillTone(r.status)} />
                            )}
                            {canApproveHere && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => { e.stopPropagation(); handleApprove(r); }}
                                disabled={pending}
                                className="h-7 px-2 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                      {(visibleCols.leads || visibleCols.sent || visibleCols.replyRate || visibleCols.bounceRate) && (
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-4">
                            {visibleCols.leads && (
                              <div className="text-xs"><p className="font-semibold text-slate-900">{r.leads === null ? "—" : r.leads.toLocaleString()}</p><p className="text-slate-400">Leads</p></div>
                            )}
                            {visibleCols.sent && (
                              <div className="text-xs"><p className="font-semibold text-slate-900">{r.sent ? r.sent.toLocaleString() : "—"}</p><p className="text-slate-400">Sent</p></div>
                            )}
                            {visibleCols.replyRate && (
                              <div className="text-xs"><p className="font-semibold text-slate-900">{r.sent ? `${r.replyRate}%` : "—"}</p><p className="text-slate-400">Reply</p></div>
                            )}
                            {visibleCols.bounceRate && (
                              <div className="text-xs"><p className="font-semibold text-slate-900">{r.bounceRate === null ? "—" : r.sent ? `${r.bounceRate}%` : "—"}</p><p className="text-slate-400">Bounce</p></div>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleCols.owner && (
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
                      )}
                      {visibleCols.lastModified && <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{formatDate(r.updatedAt)}</td>}
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              if (openId === r.id) { setOpenId(null); return; }
                              const rect = e.currentTarget.getBoundingClientRect();
                              setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                              setOpenId(r.id);
                            }}
                            aria-label="Campaign actions"
                            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {openId === r.id && menuPos && createPortal(
                            <div
                              ref={menuRef}
                              style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
                              className="lp-anim-pop origin-top-right z-50 w-44 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden p-1"
                            >
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
                            </div>,
                            document.body
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

      {/* Floating selection action bar — mirrors the Leads table's bulk-action pill */}
      {selected.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 lp-anim-pop max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-3 rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/30 pl-5 pr-3 py-2.5">
            <span className="text-sm font-medium whitespace-nowrap">
              <span className="font-semibold">{selected.length}</span> selected
            </span>
            <span className="h-5 w-px bg-white/20" />
            {selectedApprovable.length > 0 && (
              <button
                onClick={handleBulkApprove}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-full bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 px-3.5 py-1.5 text-sm font-medium transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve ({selectedApprovable.length})
              </button>
            )}
            <button
              onClick={handleBulkDelete}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full bg-white text-red-600 hover:bg-red-50 disabled:opacity-50 px-3.5 py-1.5 text-sm font-medium transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <button
              onClick={() => setSelected([])}
              className="rounded-full bg-white text-blue-600 hover:bg-blue-50 px-3.5 py-1.5 text-sm font-medium transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
