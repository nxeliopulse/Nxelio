"use client";
import { useState, useTransition, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, MoreHorizontal, Pause, Play, Copy, Pencil, Search, LayoutTemplate, ChevronDown, ChevronRight, Megaphone, Link2, Send, CheckCircle2, Undo2, Archive, Star, LayoutGrid, List, Columns3, ArrowUp, ArrowDown, ArrowUpDown, Eye, MessageSquare, Filter as FilterIcon, X, RefreshCw } from "lucide-react";
import { ConnectionsModal } from "@/components/campaigns/connections-modal";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import { setCampaignStatus, duplicateCampaign, type CampaignRow } from "@/lib/queries/campaigns";
import { setSequenceStatus, duplicateSequence, type OutreachSequenceRow } from "@/lib/queries/outreach";
import { submitForReview, approveCampaign, sendBackToDraft, archiveCampaign } from "@/lib/queries/campaign-approval";
import { APPROVAL_STATUSES, approvalBadgeVariant } from "@/lib/campaign-approval-ui";
import { campaignTemplates } from "@/lib/campaign-templates";
import { formatDate, cn } from "@/lib/utils";
import { usePageTour } from "@/components/tour/use-page-tour";
import { CAMPAIGNS_TOUR_STEPS } from "@/components/tour/tour-registry";

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
  openRate?: number;
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
export function campaignChannelLabel(content: string | null): "Email" | "LinkedIn" | "Multichannel" {
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

export function ChannelBadge({ label }: { label: "Email" | "LinkedIn" | "Multichannel" }) {
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
    case "Pending review": case "Paused": return "warning";
    case "Archived": return "default";
    case "Live/Distributing": return "info";
    default: return "default"; // Draft (AI-generated)
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
  const { toast, prompt } = useFeedback();
  const router = useRouter();
  usePageTour("campaigns", CAMPAIGNS_TOUR_STEPS);
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const [cardFilter, setCardFilter] = useState<"all" | "active" | "sent" | "opened" | "replied">("all");
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
    setSearch(""); setCardFilter("all"); setApprovalFilter("All"); setTypeFilter([]); setDateFrom(""); setDateTo("");
  }
  const activeFilterCount = (search ? 1 : 0) + (cardFilter !== "all" ? 1 : 0) + (approvalFilter !== "All" ? 1 : 0) + (typeFilter.length > 0 ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);
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
      openRate: Number(c.open_rate || 0),
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
      openRate: 0,
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
      
      let matchCard = true;
      if (cardFilter === "active") matchCard = r.status === "Active";
      else if (cardFilter === "sent") matchCard = r.sent > 0;
      else if (cardFilter === "opened") matchCard = (r.openRate ?? 0) > 0;
      else if (cardFilter === "replied") matchCard = r.replyRate > 0;

      const matchApproval = approvalFilter === "All" ? r.approvalStatus !== "Archived" : r.approvalStatus === approvalFilter;
      const matchDateFrom = !dateFrom || r.updatedAt >= dateFrom;
      const matchDateTo = !dateTo || r.updatedAt <= `${dateTo}T23:59:59.999Z`;
      const matchType = typeFilter.length === 0 || typeFilter.includes(r.channelLabel);
      return matchSearch && matchCard && matchApproval && matchDateFrom && matchDateTo && matchType;
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
  const selectedArchivable = selectedRows.filter((r) => r.kind === "email" && r.approvalStatus !== "Archived");

  function toggleStatus(r: UnifiedRow) {
    setOpenId(null);
    const next = r.status === "Active" ? "Paused" : "Active";
    start(async () => {
      if (r.kind === "email") await setCampaignStatus(r.id, next);
      else await setSequenceStatus(r.id, next);
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

  function handleBulkArchive() {
    const ids = selectedArchivable.map((r) => r.id);
    if (!ids.length) return;
    start(async () => {
      const results = await Promise.allSettled(ids.map((id) => archiveCampaign(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      setSelected([]);
      if (failed) toast(`Archived ${ids.length - failed} of ${ids.length} — ${failed} failed.`, failed === ids.length ? "error" : "info");
      else toast(`${ids.length} campaign${ids.length === 1 ? "" : "s"} archived.`, "success");
    });
  }

  const statCards = [
    { label: "Active campaigns", value: cStats.active + sStats.active, icon: Megaphone, accent: "bg-amber-500", key: "active", ring: "ring-amber-500", bg: "bg-amber-500/[0.04] dark:bg-amber-500/[0.08]" },
    { label: "Messages sent", value: (cStats.totalSent + sStats.sent).toLocaleString(), icon: Send, accent: "bg-blue-500", key: "sent", ring: "ring-blue-500", bg: "bg-blue-500/[0.04] dark:bg-blue-500/[0.08]" },
    { label: "Avg. open rate", value: `${cStats.avgOpen}%`, icon: Eye, accent: "bg-rose-500", key: "opened", ring: "ring-rose-500", bg: "bg-rose-500/[0.04] dark:bg-rose-500/[0.08]" },
    { label: "Avg. reply rate", value: `${cStats.avgReply || sStats.replyRate}%`, icon: MessageSquare, accent: "bg-emerald-500", key: "replied", ring: "ring-emerald-500", bg: "bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08]" },
  ];

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Page header — title + breadcrumb, matching the Prospects screen */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 data-tour-id="campaigns-title" className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Campaigns
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
            <Link href="/dashboard" className="hover:text-slate-700 dark:hover:text-slate-600">Home</Link>
            <span className="mx-1">›</span>
            <span className="text-slate-700 dark:text-slate-600 font-medium">Campaigns</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              toast("Refreshing campaigns...", "info");
              router.refresh();
              setTimeout(() => window.location.reload(), 100);
            }}
            title="Refresh"
            className="rounded-xl h-8 w-8"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Link href="/campaigns/builder">
            <Button data-tour-id="campaigns-new" size="sm" className="rounded-xl gap-1.5 font-semibold h-8 text-xs px-3">
              <Plus className="h-3.5 w-3.5" /> New Campaign
            </Button>
          </Link>
        </div>
      </div>

      {/* Stat cards — clickable colored KPI grid, same pattern as Prospects */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {statCards.map((s) => {
          const Icon = s.icon;
          const clickable = !!s.key;
          const active = clickable && cardFilter === s.key;
          return (
            <Card
              key={s.label}
              onClick={clickable ? () => { setCardFilter((prev) => prev === s.key ? "all" : (s.key as any)); } : undefined}
              className={cn(
                "p-4 sm:p-5 flex items-center gap-3",
                clickable && "cursor-pointer select-none transition-all duration-200 hover:scale-[1.02] hover:shadow-xs",
                active
                  ? `ring-2 ${s.ring} ${s.bg} border-transparent shadow-xs`
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
              )}
            >
              <span className={cn("h-11 w-11 rounded-full text-white flex items-center justify-center flex-shrink-0", s.accent)}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-500 truncate">{s.label}</p>
                <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">{s.value}</p>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-visible">
        {/* Toolbar: Search, Filters, Actions, View Mode Toggle, Create button */}
        <div data-tour-id="campaigns-filter" className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
            {/* Search Input */}
            <div className="w-full sm:w-52">
              <Input
                leftIcon={<Search className="h-4 w-4 text-slate-400" />}
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 text-xs rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xs focus:ring-1 focus:ring-[var(--primary)]"
              />
            </div>

            {/* Badged Count Button */}
            <div className="inline-flex items-center gap-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-850 text-xs font-semibold text-slate-700 dark:text-slate-300 h-9 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <Megaphone className="h-3.5 w-3.5 text-slate-500" />
              <span>
                {filtered.length}{" "}
                {cardFilter === "active"
                  ? "Active Campaign"
                  : cardFilter === "sent"
                  ? "Sent Campaign"
                  : cardFilter === "opened"
                  ? "Opened Campaign"
                  : cardFilter === "replied"
                  ? "Replied Campaign"
                  : "Campaign"}
                {filtered.length === 1 ? "" : "s"}
              </span>
              {cardFilter !== "all" && (
                <button
                  onClick={() => setCardFilter("all")}
                  title="Clear filter"
                  className="p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 cursor-pointer ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Active only filter button */}
            <button
              onClick={() => setCardFilter((prev) => prev === "active" ? "all" : "active")}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 px-3 rounded-xl text-xs font-semibold border transition-all h-9 shadow-2xs select-none",
                cardFilter === "active"
                  ? "bg-slate-900 text-white border-transparent dark:bg-slate-100 dark:text-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-350 dark:border-slate-800"
              )}
            >
              {cardFilter === "active" ? "✓ Active Only" : "Active Only"}
            </button>

            {/* Approval stages select dropdown */}
            <select
              value={approvalFilter}
              onChange={(e) => setApprovalFilter(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-700 dark:text-slate-350 outline-none focus:ring-1 focus:ring-[var(--primary)] transition-all cursor-pointer h-9 shadow-2xs"
            >
              <option value="All">All approval stages</option>
              {APPROVAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            {/* Sort Select */}
            <select
              value={`${sortField}:${sortDir}`}
              onChange={(e) => { const [f, d] = e.target.value.split(":"); setSortField(f as SortField); setSortDir(d as "asc" | "desc"); }}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-700 dark:text-slate-350 outline-none focus:ring-1 focus:ring-[var(--primary)] transition-all cursor-pointer h-9 shadow-2xs"
            >
              <option value="updatedAt:desc">Sort: Newest first</option>
              <option value="updatedAt:asc">Sort: Oldest first</option>
              <option value="name:asc">Sort: Name A-Z</option>
              <option value="leads:desc">Sort: Most prospects</option>
              <option value="sent:desc">Sort: Most sent</option>
              <option value="replyRate:desc">Sort: Best reply rate</option>
            </select>

            {/* Date range inputs */}
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                max={dateTo || undefined}
                className="h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs text-slate-700 dark:text-slate-350 focus:outline-none focus:ring-1 focus:ring-[var(--primary)] shadow-2xs"
                aria-label="Last modified from"
              />
              <span className="text-slate-400">–</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                min={dateFrom || undefined}
                className="h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs text-slate-700 dark:text-slate-350 focus:outline-none focus:ring-1 focus:ring-[var(--primary)] shadow-2xs"
                aria-label="Last modified to"
              />
            </div>

            {/* Filter Dropdown */}
            <div className="relative" ref={filterRef}>
              <Button
                variant="outline"
                size="custom"
                onClick={() => setFilterOpen((v) => !v)}
                className={cn(
                  "h-9 px-3 text-xs rounded-xl font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-[var(--muted)] shadow-2xs flex items-center justify-center gap-1.5",
                  filterOpen && "bg-slate-50 dark:bg-slate-800"
                )}
              >
                <FilterIcon className="h-4 w-4" /> Filter
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filterOpen ? "rotate-180" : ""}`} />
              </Button>
              {filterOpen && (
                <div className="lp-anim-pop origin-top-right absolute right-0 top-full mt-1 z-20 w-72 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white"><FilterIcon className="h-4 w-4" /> Filter</span>
                    <button onClick={() => setFilterOpen(false)} aria-label="Close" className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">Type</p>
                      <div className="flex flex-col gap-1.5">
                        {(["Email", "LinkedIn", "Multichannel"] as const).map((t) => (
                          <label key={t} className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-600 cursor-pointer select-none">
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
                        className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">End date</p>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        min={dateFrom || undefined}
                        className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">Status</p>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-600 cursor-pointer select-none mb-2">
                        <input
                          type="checkbox"
                          checked={cardFilter === "active"}
                          onChange={(e) => setCardFilter(e.target.checked ? "active" : "all")}
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

                  <div className="flex items-center gap-2 p-3 border-t border-slate-100 dark:border-slate-800">
                    <Button variant="outline" className="flex-1" onClick={resetFilters}>Reset</Button>
                    <Button className="flex-1" onClick={() => setFilterOpen(false)}>Filter</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Manage Columns dropdown — list view only */}
            {viewMode === "list" && (
              <div className="relative" ref={colsRef}>
                <Button
                  variant="outline"
                  size="custom"
                  onClick={() => setColumnsOpen((v) => !v)}
                  className={cn(
                    "h-9 px-3 text-xs rounded-xl font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-[var(--muted)] shadow-2xs flex items-center justify-center gap-1.5",
                    columnsOpen && "bg-slate-50 dark:bg-slate-800"
                  )}
                >
                  <Columns3 className="h-4 w-4" /> Manage Columns
                </Button>
                {columnsOpen && (
                  <div className="lp-anim-pop origin-top-right absolute right-0 top-full mt-1 z-20 w-56 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden p-1">
                    <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Show columns</p>
                    {([
                      ["status", "Status"],
                      ["leads", "Prospects"],
                      ["sent", "Sent"],
                      ["replyRate", "Reply rate"],
                      ["bounceRate", "Bounce rate"],
                      ["owner", "Owner"],
                      ["lastModified", "Last modified"],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer select-none">
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

            {/* Templates dropdown */}
            <div className="relative" ref={tplRef}>
              <Button
                variant="outline"
                size="custom"
                onClick={() => setTemplatesOpen((v) => !v)}
                className={cn(
                  "h-9 px-3 text-xs rounded-xl font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-[var(--muted)] shadow-2xs flex items-center justify-center gap-1.5",
                  templatesOpen && "bg-slate-50 dark:bg-slate-800"
                )}
              >
                <LayoutTemplate className="h-4 w-4" /> Templates <ChevronDown className={`h-3.5 w-3.5 transition-transform ${templatesOpen ? "rotate-180" : ""}`} />
              </Button>
              {templatesOpen && (
                <div className="lp-anim-pop origin-top-right absolute right-0 top-full mt-1 z-20 w-72 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden p-1">
                  <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Start from a template</p>
                  <div className="max-h-80 overflow-y-auto">
                    {campaignTemplates.map((t) => {
                      const Icon = t.icon;
                      return (
                        <button
                          key={t.id}
                          onClick={() => { setTemplatesOpen(false); router.push(`/campaigns/builder?template=${t.id}`); }}
                          className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <span className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${t.accent}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-slate-900 dark:text-white">{t.name} <span className="text-[11px] font-normal text-slate-400">· {t.steps.length} steps</span></span>
                            <span className="block text-xs text-slate-500 line-clamp-1">{t.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Connections */}
            <Button
              variant="outline"
              size="custom"
              onClick={() => setConnectionsOpen(true)}
              className="h-9 px-3 text-xs rounded-xl font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-[var(--muted)] shadow-2xs flex items-center justify-center gap-1.5"
            >
              <Link2 className="h-4 w-4" /> Connections
            </Button>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-50 dark:bg-slate-950/60">
              <button
                onClick={() => setViewMode("list")}
                aria-label="List view"
                className={cn(
                  "p-1.5 rounded-lg text-xs font-semibold transition-all",
                  viewMode === "list"
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                className={cn(
                  "p-1.5 rounded-lg text-xs font-semibold transition-all",
                  viewMode === "grid"
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
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
          <div data-tour-id="campaigns-list" className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                    {/* Paused overrides the approval badge — "Live/Distributing" is the
                        approval lifecycle stage, not whether it's actually sending right
                        now, so a paused campaign must never still read as running. */}
                    {r.status === "Paused" ? (
                      <Badge variant="warning">Paused</Badge>
                    ) : r.approvalStatus ? (
                      <Badge variant={approvalBadgeVariant(r.approvalStatus)}>{r.approvalStatus}</Badge>
                    ) : (
                      <Badge variant={isActive ? "success" : "default"}>{r.status}</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
                    <div><p className="text-slate-400">Prospects</p><p className="font-medium text-slate-900">{r.leads === null ? "—" : r.leads.toLocaleString()}</p></div>
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
          <div data-tour-id="campaigns-list" className="overflow-x-auto">
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
                            {/* Same override as the card view — Paused must never be
                                masked by a stale "Live/Distributing" approval badge. */}
                            {r.status === "Paused" ? (
                              <StatusPill label="Paused" tone="warning" />
                            ) : r.approvalStatus ? (
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
                              <div className="text-xs"><p className="font-semibold text-slate-900">{r.leads === null ? "—" : r.leads.toLocaleString()}</p><p className="text-slate-400">Prospects</p></div>
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
                              {r.kind === "email" && r.approvalStatus !== "Archived" && (
                                <button onClick={() => handleArchive(r)} disabled={pending} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                                  <Archive className="h-4 w-4 text-slate-400" /> Archive
                                </button>
                              )}
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
            {selectedArchivable.length > 0 && (
              <button
                onClick={handleBulkArchive}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-full bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 px-3.5 py-1.5 text-sm font-medium transition-colors"
              >
                <Archive className="h-3.5 w-3.5" /> Archive ({selectedArchivable.length})
              </button>
            )}
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
