"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Filter, Plus, Trash2, ChevronDown, Users2, Mail, Briefcase, User, ArrowUpDown, Info, Building2, Settings2, Hash, Phone, Globe, Calendar, Link2, CheckCircle2, XCircle, Tag, Share2, Layers3, X, Sparkles, Loader2, MoreVertical, Play, type LucideIcon } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { industries, interestAreas } from "@/lib/mock-data";
import { AddLeadsWizard } from "@/components/leads/add-leads-wizard";
import { AiColumnModal } from "@/components/leads/ai-column-modal";
import { deleteLead, bulkDeleteLeads, type LeadRow } from "@/lib/queries/leads";
import { createStaticSegment } from "@/lib/queries/segments";
import { runAiColumn, deleteAiColumn, getAiColumnProgress, type AiColumnDefinitionRow, type AiColumnSavedTemplateRow } from "@/lib/queries/ai-columns";

const statusVariant: Record<string, "default" | "blue" | "warning" | "danger" | "success" | "purple"> = {
  New: "blue",
  Warm: "warning",
  Hot: "danger",
  Converted: "success",
  Scored: "purple",
};

// Customizable columns. Users toggle these via the gear menu in the header; the
// choice persists in localStorage so it survives reloads. `index`, the checkbox,
// and the delete/actions column are always shown and not part of this list logic.
type ColKey =
  | "index" | "first_name" | "last_name" | "email" | "company" | "industry"
  | "email_provider" | "score" | "status" | "phone" | "interest_area"
  | "source" | "linkedin" | "website" | "verified" | "created_at";

interface ColumnDef { key: ColKey; label: string; icon?: LucideIcon; defaultOn: boolean }

const COLUMNS: ColumnDef[] = [
  { key: "index", label: "Row #", icon: Hash, defaultOn: true },
  { key: "first_name", label: "First name", icon: User, defaultOn: true },
  { key: "last_name", label: "Last name", icon: User, defaultOn: true },
  { key: "email", label: "Email", icon: Mail, defaultOn: true },
  { key: "company", label: "Company", icon: Building2, defaultOn: true },
  { key: "industry", label: "Industry", icon: Briefcase, defaultOn: true },
  { key: "email_provider", label: "Email provider", icon: Mail, defaultOn: true },
  { key: "score", label: "Score", defaultOn: true },
  { key: "status", label: "Status", defaultOn: true },
  { key: "phone", label: "Phone", icon: Phone, defaultOn: false },
  { key: "interest_area", label: "Interest area", icon: Tag, defaultOn: false },
  { key: "source", label: "Source", icon: Globe, defaultOn: false },
  { key: "linkedin", label: "LinkedIn", icon: Share2, defaultOn: false },
  { key: "website", label: "Website", icon: Link2, defaultOn: false },
  { key: "verified", label: "Verified", icon: CheckCircle2, defaultOn: false },
  { key: "created_at", label: "Added", icon: Calendar, defaultOn: false },
];

const DEFAULT_COLS = COLUMNS.reduce((acc, c) => { acc[c.key] = c.defaultOn; return acc; }, {} as Record<ColKey, boolean>);
const COLS_STORAGE_KEY = "lp_leads_columns";

interface Props {
  leads: LeadRow[];
  /** Accepted for backwards-compat with the page; the stat strip was removed. */
  stats?: { total: number; hot: number; scored: number; converted: number };
  /** When set, the list is scoped to one campaign's recipients (from "View report"). */
  campaignFilter?: { id: string; name: string };
  /** Pre-populate the search box (from global search). */
  initialSearch?: string;
  /** Saved Clay-style custom AI columns for this workspace, rendered after the built-in columns. */
  aiColumns?: AiColumnDefinitionRow[];
  /** Workspace's own saved AI column templates (user-created, distinct from the built-in library). */
  aiColumnSavedTemplates?: AiColumnSavedTemplateRow[];
}

export function LeadsTable({ leads, campaignFilter, initialSearch, aiColumns = [], aiColumnSavedTemplates = [] }: Props) {
  const { confirm, prompt, toast } = useFeedback();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState(initialSearch ?? "");
  const [industryFilter, setIndustryFilter] = useState("");
  const [interestFilter, setInterestFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [page, setPage] = useState(0);

  // Clicking a lead navigates to its own full page (/leads/[id]) — matches how
  // campaign-detail-view.tsx gives each campaign a real standalone page instead
  // of an overlay on the list.
  function openLead(id: string) {
    router.push(`/leads/${id}`);
  }
  const [sort, setSort] = useState<"none" | "name" | "score" | "newest">("none");
  const scrollRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 15;

  // Per-column header search (click a header to filter by that column's value).
  const [columnFilters, setColumnFilters] = useState<Partial<Record<ColKey, string>>>({});
  const [filterPopover, setFilterPopover] = useState<{ key: ColKey; top: number; left: number } | null>(null);
  const [filterDraft, setFilterDraft] = useState("");

  // Industry/interest/date filters — opened as a popover next to the count chip.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersPos, setFiltersPos] = useState<{ top: number; left: number } | null>(null);
  const hasActiveFilters = Boolean(industryFilter || interestFilter || dateFrom || dateTo);
  function openFiltersPopover(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setFiltersPos({ top: r.bottom + 6, left: r.left });
    setFiltersOpen(true);
  }

  // Column visibility (persisted). Hydrate from localStorage after mount to avoid SSR mismatch.
  const [cols, setCols] = useState<Record<ColKey, boolean>>(DEFAULT_COLS);
  const [showCols, setShowCols] = useState(false);
  const [colsPos, setColsPos] = useState<{ top: number; right: number } | null>(null);

  // Hydrate saved column choices after mount (localStorage is client-only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLS_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setCols({ ...DEFAULT_COLS, ...JSON.parse(raw) });
    } catch { /* ignore malformed storage */ }
  }, []);

  function toggleCol(k: ColKey) {
    setCols((c) => {
      const next = { ...c, [k]: !c[k] };
      try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  function resetCols() {
    setCols(DEFAULT_COLS);
    try { localStorage.removeItem(COLS_STORAGE_KEY); } catch { /* ignore */ }
  }
  function openColsMenu(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setColsPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    setShowCols(true);
  }

  const visibleCols = COLUMNS.filter((c) => cols[c.key]);

  // Clay-style custom AI columns — creation/run/delete + per-row single-cell generation.
  const [showAiColumnModal, setShowAiColumnModal] = useState(false);
  const [aiColMenu, setAiColMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [runningColumnId, setRunningColumnId] = useState<string | null>(null);
  const [runningCellKey, setRunningCellKey] = useState<string | null>(null);
  // Live progress while a "Run on all leads" bulk job is in flight — polled from the
  // server since runAiColumn itself is one long request with no incremental callback.
  const [runProgress, setRunProgress] = useState<{ columnId: string; done: number; total: number } | null>(null);

  function openAiColMenu(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    const r = e.currentTarget.getBoundingClientRect();
    setAiColMenu({ id, top: r.bottom + 6, left: r.left });
  }

  function runAiColumnOnAll(columnId: string) {
    setAiColMenu(null);
    setRunningColumnId(columnId);
    setRunProgress({ columnId, done: 0, total: leads.length });

    const poll = setInterval(async () => {
      const p = await getAiColumnProgress(columnId);
      setRunProgress({ columnId, ...p });
    }, 1200);

    start(async () => {
      await runAiColumn(columnId);
      clearInterval(poll);
      setRunningColumnId(null);
      setRunProgress(null);
      router.refresh();
    });
  }

  async function handleDeleteAiColumn(columnId: string) {
    setAiColMenu(null);
    if (!(await confirm({ title: "Delete AI column?", message: "This removes the column and its generated values for every lead.", confirmLabel: "Delete", danger: true }))) return;
    start(async () => {
      await deleteAiColumn(columnId);
      router.refresh();
    });
  }

  function runAiColumnOnRow(columnId: string, leadId: string) {
    const key = `${columnId}:${leadId}`;
    setRunningCellKey(key);
    start(async () => {
      await runAiColumn(columnId, [leadId]);
      setRunningCellKey(null);
      router.refresh();
    });
  }

  const activeColumnFilterKeys = (Object.keys(columnFilters) as ColKey[]).filter((k) => columnFilters[k]);

  const filtered = leads.filter((l) => {
    const name = l.full_name || l.company_name || "";
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      name.toLowerCase().includes(q) ||
      (l.company_name?.toLowerCase().includes(q) ?? false) ||
      (l.email?.toLowerCase().includes(q) ?? false) ||
      (l.website_url?.toLowerCase().includes(q) ?? false);
    const matchIndustry = !industryFilter || l.industry === industryFilter;
    const matchInterest = !interestFilter || l.interest_area === interestFilter;

    const created = new Date(l.created_at);
    const matchDateFrom = !dateFrom || created >= new Date(`${dateFrom}T00:00:00`);
    const matchDateTo = !dateTo || created <= new Date(`${dateTo}T23:59:59`);

    const matchColumns = activeColumnFilterKeys.every((k) => {
      const v = (columnFilters[k] || "").toLowerCase();
      return getColumnText(k, l).toLowerCase().includes(v);
    });

    return matchSearch && matchIndustry && matchInterest && matchDateFrom && matchDateTo && matchColumns;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "name") return (a.full_name || a.company_name || "").localeCompare(b.full_name || b.company_name || "");
    if (sort === "score") return (b.lead_score || 0) - (a.lead_score || 0);
    if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return 0;
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function splitName(l: LeadRow): { first: string; last: string } {
    const full = (l.full_name || "").trim();
    if (!full) return { first: l.company_name || "—", last: "" };
    const parts = full.split(/\s+/);
    return { first: parts[0], last: parts.slice(1).join(" ") };
  }

  /** Clay-style compact status badge for AI column results — booleans and AnySite email
   *  lookups render as an icon + short label instead of raw text, which also reads
   *  better in a narrow column when the table is squeezed (e.g. AI Assistant open). */
  function renderAiColumnCellValue(col: AiColumnDefinitionRow, value: string) {
    if (col.action_type === "anysite_email") {
      const isEmail = /\S+@\S+\.\S+/.test(value);
      return isEmail ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 max-w-full">
          <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{value}</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 max-w-full">
          <XCircle className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{value || "Not found"}</span>
        </span>
      );
    }
    if (col.output_type === "boolean") {
      const isYes = /^\s*(yes|true)\b/i.test(value);
      return isYes ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
          <CheckCircle2 className="h-3 w-3" /> Yes
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
          <XCircle className="h-3 w-3" /> No
        </span>
      );
    }
    return <span className="block max-w-[260px] truncate text-slate-700" title={value}>{value || "—"}</span>;
  }

  function emailProvider(email: string | null): { label: string; kind: "google" | "microsoft" | "yahoo" | "other" | "none" } {
    if (!email || !email.includes("@")) return { label: "—", kind: "none" };
    const domain = email.split("@")[1]?.toLowerCase() || "";
    if (/(^|\.)(gmail|googlemail)\./.test("." + domain) || domain === "gmail.com") return { label: "Google", kind: "google" };
    if (/(outlook|hotmail|live|msn|office365|microsoft)\./.test(domain) || ["outlook.com", "hotmail.com", "live.com"].includes(domain)) return { label: "Microsoft", kind: "microsoft" };
    if (/yahoo\./.test(domain) || domain === "yahoo.com") return { label: "Yahoo", kind: "yahoo" };
    return { label: "Other", kind: "other" };
  }

  /** Plain-text value of a column, for the header click-to-search filter. */
  function getColumnText(key: ColKey, l: LeadRow): string {
    switch (key) {
      case "first_name": return splitName(l).first;
      case "last_name": return splitName(l).last;
      case "email": return l.email || "";
      case "company": return l.company_name || "";
      case "industry": return l.industry || "";
      case "email_provider": return emailProvider(l.email).label;
      case "score": return String(l.lead_score ?? "");
      case "status": return l.status || "";
      case "phone": return l.phone || "";
      case "interest_area": return l.interest_area || "";
      case "source": return l.source || "";
      case "linkedin": return l.linkedin || "";
      case "website": return l.website_url || "";
      case "verified": return l.verified ? "Verified" : "No";
      case "created_at": return new Date(l.created_at).toLocaleDateString();
      default: return "";
    }
  }

  function openColumnFilter(e: React.MouseEvent<HTMLElement>, key: ColKey) {
    if (key === "index") return;
    const r = e.currentTarget.getBoundingClientRect();
    setFilterDraft(columnFilters[key] || "");
    setFilterPopover({ key, top: r.bottom + 6, left: r.left });
  }
  function applyColumnFilter() {
    if (!filterPopover) return;
    const key = filterPopover.key;
    setColumnFilters((f) => {
      const next = { ...f };
      if (filterDraft.trim()) next[key] = filterDraft.trim();
      else delete next[key];
      return next;
    });
    setFilterPopover(null);
  }
  function clearColumnFilter(key: ColKey, e?: React.MouseEvent) {
    e?.stopPropagation();
    setColumnFilters((f) => {
      const next = { ...f };
      delete next[key];
      return next;
    });
  }

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () =>
    setSelected(selected.length === filtered.length ? [] : filtered.map((l) => l.id));

  async function handleBulkDelete() {
    if (!(await confirm({ title: "Delete leads?", message: `Delete ${selected.length} leads?`, confirmLabel: "Delete", danger: true }))) return;
    const ids = [...selected];
    setSelected([]);
    start(async () => {
      await bulkDeleteLeads(ids); // single query instead of N round-trips
    });
  }

  async function handleCreateSegment() {
    const name = await prompt({
      title: "Create segment",
      message: `Create a segment with the ${selected.length} selected lead${selected.length === 1 ? "" : "s"}?`,
      label: "Segment name",
      placeholder: "e.g. Q3 conference leads",
      confirmLabel: "Create",
      required: true,
    });
    if (name === null) return;
    const ids = [...selected];
    setSelected([]);
    start(async () => {
      await createStaticSegment(name, "", ids);
      toast(`Segment "${name}" created with ${ids.length} lead${ids.length === 1 ? "" : "s"}`, "success");
    });
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete lead?", message: "Delete this lead?", confirmLabel: "Delete", danger: true }))) return;
    start(async () => {
      await deleteLead(id);
      setSelected((s) => s.filter((x) => x !== id));
    });
  }

  function renderCell(key: ColKey, l: LeadRow, rowNumber: number) {
    switch (key) {
      case "index":
        return <span className="text-slate-400 dark:text-slate-500 tabular-nums font-mono text-xs">{rowNumber}</span>;
      case "first_name":
        return (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openLead(l.id); }}
            className="font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate max-w-[150px] text-left block whitespace-nowrap"
          >
            {splitName(l).first || "—"}
          </button>
        );
      case "last_name":
        return <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[160px] block whitespace-nowrap" title={splitName(l).last || ""}>{splitName(l).last || "—"}</span>;
      case "email":
        return <span className="block max-w-[240px] truncate text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap" title={l.email || ""}>{l.email || "—"}</span>;
      case "company":
        return <span className="block max-w-[180px] truncate text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap" title={l.company_name || ""}>{l.company_name || "—"}</span>;
      case "industry":
        return <span className="block max-w-[160px] truncate text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap" title={l.industry || ""}>{l.industry || "—"}</span>;
      case "email_provider":
        return <EmailProviderCell provider={emailProvider(l.email)} />;
      case "score":
        return (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex-shrink-0">
              <div
                className={`h-full rounded-full ${l.lead_score >= 80 ? "bg-rose-500" : l.lead_score >= 60 ? "bg-amber-500" : "bg-blue-500"}`}
                style={{ width: `${l.lead_score}%` }}
              />
            </div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 tabular-nums">{l.lead_score}</span>
          </div>
        );
      case "status":
        return <Badge variant={statusVariant[l.status] || "default"}>{l.status}</Badge>;
      case "phone":
        return <span className="text-slate-600 dark:text-slate-400 font-mono text-xs whitespace-nowrap">{l.phone || "—"}</span>;
      case "interest_area":
        return <span className="text-slate-600 dark:text-slate-400 truncate max-w-[140px] block whitespace-nowrap">{l.interest_area || "—"}</span>;
      case "source":
        return <span className="text-slate-600 dark:text-slate-400 truncate max-w-[140px] block whitespace-nowrap">{l.source || "—"}</span>;
      case "linkedin":
        return l.linkedin
          ? <a href={l.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium text-xs whitespace-nowrap"><Share2 className="h-3.5 w-3.5" /> Profile</a>
          : <span className="text-slate-400">—</span>;
      case "website":
        return l.website_url
          ? <a href={l.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 max-w-[180px] truncate text-blue-600 dark:text-blue-400 hover:underline font-medium text-xs whitespace-nowrap"><Link2 className="h-3.5 w-3.5 flex-shrink-0" />{l.website_url.replace(/^https?:\/\//, "")}</a>
          : <span className="text-slate-400">—</span>;
      case "verified":
        return l.verified
          ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap"><CheckCircle2 className="h-3.5 w-3.5" /> Verified</span>
          : <span className="text-xs text-slate-400 whitespace-nowrap">No</span>;
      case "created_at":
        return <span className="text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleDateString()}</span>;
      default:
        return null;
    }
  }

  return (
    <div className="flex items-start gap-4">
    <div className={showAiColumnModal ? "flex-1 min-w-0" : "max-w-[1600px] mx-auto w-full"}>
      {campaignFilter && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
          <p className="text-sm text-blue-900">
            Showing <span className="font-semibold">{leads.length}</span> lead{leads.length === 1 ? "" : "s"} in campaign <span className="font-semibold">{campaignFilter.name}</span>
            <span className="text-blue-700/70"> · click a lead to see its email stages</span>
          </p>
          <Link href="/leads" className="text-sm font-medium text-blue-700 hover:text-blue-900">Clear filter ✕</Link>
        </div>
      )}
      <Card className="overflow-hidden">
        {/* Compact Single-Line Toolbar */}
        <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 overflow-x-auto scrollbar-hide">
          {/* Left Controls: Search + Count + Compact Tool Buttons */}
          <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
            {/* Search Input */}
            <div className="w-36 sm:w-48 md:w-56 flex-shrink-0">
              <Input
                leftIcon={<Search className="h-3.5 w-3.5 text-slate-400" />}
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs rounded-xl"
              />
            </div>

            {/* Count Chip */}
            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 flex-shrink-0">
              <Users2 className="h-3.5 w-3.5 text-slate-400" />
              <span>{filtered.length}</span>
            </div>

            {/* Filter Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={openFiltersPopover}
              className={cn(
                "rounded-xl gap-1 font-medium h-8 text-xs px-2.5 flex-shrink-0",
                hasActiveFilters && "ring-1 ring-blue-500/30 border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40"
              )}
              title="Filter leads"
            >
              <Filter className="h-3.5 w-3.5" />
              <span>Filter</span>
              {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
            </Button>

            {/* Columns Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={openColsMenu}
              className="rounded-xl gap-1 font-medium h-8 text-xs px-2.5 text-slate-700 dark:text-slate-300 flex-shrink-0"
              title="Customize visible columns"
            >
              <Settings2 className="h-3.5 w-3.5 text-slate-400" />
              <span>Columns</span>
            </Button>

            {/* Use AI Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAiColumnModal(true)}
              className="rounded-xl gap-1 font-semibold h-8 text-xs px-2.5 border-blue-200 dark:border-blue-800/60 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex-shrink-0"
              title="Use AI column enrichment"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              <span>AI</span>
            </Button>
          </div>

          {/* Right Controls: Bulk Delete + Sort Dropdown + Add Leads Primary Button */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            {selected.length > 0 && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleBulkDelete}
                className="rounded-xl gap-1 font-semibold h-8 px-2.5 text-xs flex-shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Delete</span> ({selected.length})
              </Button>
            )}

            {/* Sort Dropdown */}
            <div className="relative inline-flex items-center flex-shrink-0">
              <ArrowUpDown className="h-3 w-3 text-slate-400 absolute left-2 pointer-events-none" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="appearance-none rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-6 pr-6 py-1 h-8 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm cursor-pointer"
              >
                <option value="none">Sort</option>
                <option value="name">Name A–Z</option>
                <option value="score">Score High→Low</option>
                <option value="newest">Newest</option>
              </select>
              <ChevronDown className="h-3 w-3 text-slate-400 absolute right-2 pointer-events-none" />
            </div>

            {/* Add Leads Primary Button */}
            <Button
              size="sm"
              onClick={() => setShowWizard(true)}
              className="rounded-xl gap-1.5 font-bold h-8 px-3 text-xs flex-shrink-0 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Leads</span>
            </Button>
          </div>
        </div>

        {/* Table Container */}
        <div className="relative">
          <div ref={scrollRef} className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-260px)] scrollbar-hide">
            <table className="w-full text-sm border-collapse min-w-[900px]">
              <thead className="bg-slate-50/90 dark:bg-slate-950/80 border-b border-slate-200/80 dark:border-slate-800 sticky top-0 z-10 backdrop-blur-md">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={selected.length === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="rounded border-slate-300 dark:border-slate-700"
                    />
                  </th>
                  {visibleCols.map((c) => {
                    const filterable = c.key !== "index";
                    const active = Boolean(columnFilters[c.key]);
                    return (
                      <th key={c.key} className={cn("px-4 py-3.5 font-bold whitespace-nowrap", c.key === "index" && "w-12")}>
                        <span
                          role={filterable ? "button" : undefined}
                          title={filterable ? `Click to search ${c.label}` : undefined}
                          onClick={filterable ? (e) => openColumnFilter(e, c.key) : undefined}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 -mx-1 transition-colors",
                            filterable && "cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800",
                            active && "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60"
                          )}
                        >
                          {c.icon && <c.icon className={cn("h-3.5 w-3.5", active ? "text-blue-500" : "text-slate-400")} />}
                          {c.label === "Row #" ? "#" : c.label}
                          {active && (
                            <span
                              role="button"
                              title="Clear filter"
                              onClick={(e) => clearColumnFilter(c.key, e)}
                              className="text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                            >
                              <X className="h-3 w-3" />
                            </span>
                          )}
                        </span>
                      </th>
                    );
                  })}
                  {aiColumns.map((col) => {
                    const running = runProgress?.columnId === col.id;
                    const pct = running && runProgress.total > 0 ? Math.round((runProgress.done / runProgress.total) * 100) : 0;
                    return (
                      <th key={col.id} className="px-4 py-3.5 font-bold w-[200px] max-w-[200px] whitespace-nowrap">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <Sparkles className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                          <span className="truncate" title={col.name}>{col.name}</span>
                          <button
                            onClick={(e) => openAiColMenu(e, col.id)}
                            title="Column actions"
                            className="p-0.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 flex-shrink-0 ml-auto"
                          >
                            <MoreVertical className="h-3 w-3 text-slate-400" />
                          </button>
                        </span>
                        {running && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <div className="flex-1 h-[3px] rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div className="h-full bg-blue-500 transition-[width] duration-500 rounded-full" style={{ width: `${Math.max(pct, 4)}%` }} />
                            </div>
                            <span className="text-[10px] font-normal normal-case text-slate-400 tabular-nums flex-shrink-0">{pct}%</span>
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th className="px-4 py-3.5 w-12 text-right font-bold text-slate-400"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={visibleCols.length + aiColumns.length + 2} className="px-4 py-16 text-center text-slate-500">
                      No leads yet. Click <strong>Add Leads</strong> to import from LinkedIn, social, or a CSV.
                    </td>
                  </tr>
                )}
                {paged.map((l, i) => (
                  <tr
                    key={l.id}
                    onClick={() => openLead(l.id)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.includes(l.id)}
                        onChange={() => toggle(l.id)}
                        className="rounded border-slate-300"
                      />
                    </td>
                    {visibleCols.map((c) => (
                      <td
                        key={c.key}
                        className="px-4 py-3"
                        onClick={c.key === "linkedin" || c.key === "website" ? (e) => e.stopPropagation() : undefined}
                      >
                        {renderCell(c.key, l, safePage * PAGE_SIZE + i + 1)}
                      </td>
                    ))}
                    {aiColumns.map((col) => {
                      const cellKey = `${col.id}:${l.id}`;
                      const computed = l.custom_fields?.[col.id];
                      const running = runningCellKey === cellKey || runningColumnId === col.id;
                      return (
                        <td key={col.id} className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {running ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                          ) : computed ? (
                            renderAiColumnCellValue(col, computed.value)
                          ) : (
                            <button
                              onClick={() => runAiColumnOnRow(col.id, l.id)}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                            >
                              <Play className="h-3 w-3" /> Generate
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDelete(l.id)}
                        disabled={pending}
                        title="Delete lead"
                        className="p-1 rounded-md hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
          <span>
            {filtered.length === 0
              ? "Showing 0 of 0"
              : `Showing ${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Page {safePage + 1} of {pageCount}</span>
            <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
              Next <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
            </Button>
          </div>
        </div>
      </Card>

      <AddLeadsWizard open={showWizard} onClose={() => setShowWizard(false)} />

      {/* AI column header menu — run on all rows, or delete the column */}
      {aiColMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAiColMenu(null)} />
          <div
            className="fixed z-50 w-48 rounded-xl border border-slate-200 bg-white shadow-xl p-1"
            style={{ top: aiColMenu.top, left: aiColMenu.left }}
          >
            <button
              onClick={() => runAiColumnOnAll(aiColMenu.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg"
            >
              <Play className="h-3.5 w-3.5" /> Run on all leads
            </button>
            <button
              onClick={() => handleDeleteAiColumn(aiColMenu.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete column
            </button>
          </div>
        </>
      )}

      {/* Column picker — fixed-position so the table's horizontal scroll never clips it */}
      {showCols && colsPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowCols(false)} />
          <div
            className="fixed z-50 w-60 rounded-xl border border-slate-200 bg-white shadow-xl p-2"
            style={{ top: colsPos.top, right: colsPos.right }}
          >
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Show columns</p>
            <div className="max-h-80 overflow-y-auto">
              {COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={cols[c.key]}
                    onChange={() => toggleCol(c.key)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="inline-flex items-center gap-1.5">
                    {c.icon && <c.icon className="h-3.5 w-3.5 text-slate-400" />}
                    {c.label}
                  </span>
                </label>
              ))}
            </div>
            <div className="border-t border-slate-100 mt-1 pt-1">
              <button onClick={resetCols} className="w-full text-left px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50">
                Reset to default
              </button>
            </div>
          </div>
        </>
      )}

      {/* Filters popover — anchored near the count chip */}
      {filtersOpen && filtersPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFiltersOpen(false)} />
          <div
            className="fixed z-50 w-72 rounded-xl border border-slate-200 bg-white shadow-xl p-3 space-y-3"
            style={{ top: filtersPos.top, left: filtersPos.left }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Filters</p>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Industry</label>
              <Select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)}>
                <option value="">All industries</option>
                {industries.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Interest area</label>
              <Select value={interestFilter} onChange={(e) => setInterestFilter(e.target.value)}>
                <option value="">All interest areas</option>
                {interestAreas.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Added between</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-200"
                  aria-label="From date"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-200"
                  aria-label="To date"
                />
              </div>
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => { setIndustryFilter(""); setInterestFilter(""); setDateFrom(""); setDateTo(""); }}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </>
      )}

      {/* Per-column header search popover */}
      {filterPopover && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFilterPopover(null)} />
          <div
            className="fixed z-50 w-64 rounded-xl border border-slate-200 bg-white shadow-xl p-3"
            style={{ top: filterPopover.top, left: filterPopover.left }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Search {COLUMNS.find((c) => c.key === filterPopover.key)?.label}
            </p>
            <Input
              autoFocus
              leftIcon={<Search className="h-4 w-4" />}
              placeholder="Type a value…"
              value={filterDraft}
              onChange={(e) => setFilterDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyColumnFilter(); if (e.key === "Escape") setFilterPopover(null); }}
            />
            <div className="flex items-center justify-between mt-2.5">
              <button
                onClick={() => { clearColumnFilter(filterPopover.key); setFilterPopover(null); }}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Clear
              </button>
              <Button size="sm" onClick={applyColumnFilter}>Apply</Button>
            </div>
          </div>
        </>
      )}

      {/* LP-15 — floating selection action bar */}
      {selected.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 lp-anim-pop max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-3 rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/30 pl-5 pr-3 py-2.5">
            <span className="text-sm font-medium whitespace-nowrap">
              <span className="font-semibold">{selected.length}</span> selected
            </span>
            <span className="h-5 w-px bg-white/20" />
            <button
              onClick={handleCreateSegment}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full bg-white text-blue-600 hover:bg-blue-50 disabled:opacity-50 px-3.5 py-1.5 text-sm font-medium transition-colors"
            >
              <Layers3 className="h-3.5 w-3.5" /> Create segment
            </button>
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

    {showAiColumnModal && (
      <AiColumnModal
        open={showAiColumnModal}
        onClose={() => setShowAiColumnModal(false)}
        onCreated={() => router.refresh()}
        savedTemplates={aiColumnSavedTemplates}
      />
    )}

    </div>
  );
}

function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.45.35-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.95l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

function EmailProviderCell({ provider }: { provider: { label: string; kind: "google" | "microsoft" | "yahoo" | "other" | "none" } }) {
  if (provider.kind === "none") return <span className="text-slate-400">—</span>;
  if (provider.kind === "google") {
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-700">
        <GoogleG className="h-4 w-4" /> Google
      </span>
    );
  }
  if (provider.kind === "microsoft") {
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-700">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
          <rect x="1" y="1" width="10" height="10" fill="#F25022" />
          <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
          <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
          <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
        </svg>
        Microsoft
      </span>
    );
  }
  if (provider.kind === "yahoo") {
    return <span className="inline-flex items-center gap-1.5 text-slate-700"><span className="text-[#6001D2] font-bold text-sm">Y!</span> Yahoo</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-slate-500" title="Custom / business domain">
      Other <Info className="h-3.5 w-3.5 text-slate-400" />
    </span>
  );
}
