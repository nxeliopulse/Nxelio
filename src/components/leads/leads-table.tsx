"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Filter, Plus, Trash2, ChevronDown, Users2, Mail, Briefcase, User, ArrowUpDown, Info, Building2, Settings2, Hash, Phone, Globe, Calendar, Link2, CheckCircle2, Tag, Share2, CalendarPlus, X, type LucideIcon } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { industries, interestAreas } from "@/lib/mock-data";
import { AddLeadsWizard } from "@/components/leads/add-leads-wizard";
import { LeadDetailSidebar } from "@/components/leads/lead-detail-sidebar";
import { getLeadDetail } from "@/lib/queries/lead-detail";
import type { Activity } from "@/components/leads/lead-detail-view";
import { deleteLead, bulkDeleteLeads, type LeadRow } from "@/lib/queries/leads";

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
  /** When landing directly on /leads/[id], opens the sidebar pre-loaded with this lead — avoids a second fetch/flash. */
  initialSelectedLead?: { lead: LeadRow; activities: Activity[] } | null;
}

export function LeadsTable({ leads, campaignFilter, initialSearch, initialSelectedLead }: Props) {
  const { confirm } = useFeedback();
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

  // Lead detail sidebar — opens over the table instead of navigating to /leads/[id].
  // The URL still updates (via raw history push, not router.push) so the lead stays
  // linkable/bookmarkable without remounting this table and losing filter/page state.
  const [openLeadId, setOpenLeadId] = useState<string | null>(initialSelectedLead?.lead.id ?? null);
  const [openLeadData, setOpenLeadData] = useState<{ lead: LeadRow; activities: Activity[] } | null>(initialSelectedLead ?? null);
  const [openLeadLoading, setOpenLeadLoading] = useState(false);

  async function openLead(id: string) {
    if (id === openLeadId) return;
    setOpenLeadId(id);
    setOpenLeadData(null);
    setOpenLeadLoading(true);
    window.history.pushState(null, "", `/leads/${id}`);
    const { lead, activities } = await getLeadDetail(id);
    setOpenLeadLoading(false);
    if (lead) setOpenLeadData({ lead: lead as LeadRow, activities: activities as Activity[] });
  }

  function closeLead() {
    setOpenLeadId(null);
    setOpenLeadData(null);
    window.history.pushState(null, "", "/leads");
  }

  useEffect(() => {
    function onPopState() {
      const m = window.location.pathname.match(/^\/leads\/([^/]+)$/);
      if (m) {
        const id = m[1];
        if (id !== openLeadId) {
          setOpenLeadId(id);
          setOpenLeadData(null);
          setOpenLeadLoading(true);
          getLeadDetail(id).then(({ lead, activities }) => {
            setOpenLeadLoading(false);
            if (lead) setOpenLeadData({ lead: lead as LeadRow, activities: activities as Activity[] });
          });
        }
      } else {
        setOpenLeadId(null);
        setOpenLeadData(null);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [openLeadId]);
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
        return <span className="text-slate-400 tabular-nums">{rowNumber}</span>;
      case "first_name":
        return (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openLead(l.id); }}
            className="font-medium text-slate-900 hover:text-blue-600"
          >
            {splitName(l).first || "—"}
          </button>
        );
      case "last_name":
        return <span className="text-slate-700">{splitName(l).last || "—"}</span>;
      case "email":
        return <span className="block max-w-[220px] truncate text-slate-600" title={l.email || ""}>{l.email || "—"}</span>;
      case "company":
        return <span className="text-slate-700">{l.company_name || "—"}</span>;
      case "industry":
        return <span className="text-slate-600">{l.industry || "—"}</span>;
      case "email_provider":
        return <EmailProviderCell provider={emailProvider(l.email)} />;
      case "score":
        return (
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${l.lead_score >= 80 ? "bg-red-500" : l.lead_score >= 60 ? "bg-amber-500" : "bg-blue-500"}`}
                style={{ width: `${l.lead_score}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-slate-700">{l.lead_score}</span>
          </div>
        );
      case "status":
        return <Badge variant={statusVariant[l.status] || "default"}>{l.status}</Badge>;
      case "phone":
        return <span className="text-slate-600">{l.phone || "—"}</span>;
      case "interest_area":
        return <span className="text-slate-600">{l.interest_area || "—"}</span>;
      case "source":
        return <span className="text-slate-600">{l.source || "—"}</span>;
      case "linkedin":
        return l.linkedin
          ? <a href={l.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline"><Share2 className="h-3.5 w-3.5" /> Profile</a>
          : <span className="text-slate-400">—</span>;
      case "website":
        return l.website_url
          ? <a href={l.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 max-w-[180px] truncate text-blue-600 hover:underline"><Link2 className="h-3.5 w-3.5 flex-shrink-0" />{l.website_url.replace(/^https?:\/\//, "")}</a>
          : <span className="text-slate-400">—</span>;
      case "verified":
        return l.verified
          ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Verified</span>
          : <span className="text-xs text-slate-400">No</span>;
      case "created_at":
        return <span className="text-slate-500">{new Date(l.created_at).toLocaleDateString()}</span>;
      default:
        return null;
    }
  }

  return (
    <div className="flex items-start gap-0">
    <div className={openLeadId ? "flex-1 min-w-0" : "max-w-[1600px] mx-auto w-full"}>
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
        {/* Toolbar — instantly-style */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="min-w-[200px] max-w-xs flex-1 sm:flex-none sm:w-72">
            <Input
              leftIcon={<Search className="h-4 w-4" />}
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Divider + count chip */}
          <div className="hidden sm:block h-6 w-px bg-slate-200" />
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
            <Users2 className="h-4 w-4 text-slate-400" />
            {filtered.length}
          </div>

          {/* Filters — click opens a popover anchored right next to the count chip */}
          <Button
            variant="outline"
            size="sm"
            onClick={openFiltersPopover}
            className={hasActiveFilters ? "ring-1 ring-blue-200 border-blue-300 text-blue-700" : ""}
          >
            <Filter className="h-4 w-4" /> Filters
            {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
          </Button>

          <div className="ml-auto flex items-center gap-2">
            {/* Sort */}
            <div className="relative inline-flex items-center">
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="appearance-none rounded-lg border border-slate-200 bg-white pl-7 pr-7 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-200"
              >
                <option value="none">No sort</option>
                <option value="name">Name A–Z</option>
                <option value="score">Score high→low</option>
                <option value="newest">Newest first</option>
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
            </div>

            <Button size="sm" onClick={() => setShowWizard(true)}>
              <Plus className="h-4 w-4" /> Add Leads
            </Button>
          </div>
        </div>


        {/* Table with horizontal scroll */}
        <div className="relative">
          <div ref={scrollRef} className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.length === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="rounded border-slate-300"
                    />
                  </th>
                  {visibleCols.map((c) => {
                    const filterable = c.key !== "index";
                    const active = Boolean(columnFilters[c.key]);
                    return (
                      <th key={c.key} className={cn("px-4 py-3 font-semibold", c.key === "index" && "w-12")}>
                        <span
                          role={filterable ? "button" : undefined}
                          title={filterable ? `Click to search ${c.label}` : undefined}
                          onClick={filterable ? (e) => openColumnFilter(e, c.key) : undefined}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 -mx-1",
                            filterable && "cursor-pointer hover:bg-slate-200/60",
                            active && "text-blue-700 bg-blue-50"
                          )}
                        >
                          {c.icon && <c.icon className={cn("h-3.5 w-3.5", active ? "text-blue-500" : "text-slate-400")} />}
                          {c.label === "Row #" ? "#" : c.label}
                          {active && (
                            <span
                              role="button"
                              title="Clear filter"
                              onClick={(e) => clearColumnFilter(c.key, e)}
                              className="text-blue-400 hover:text-blue-700"
                            >
                              <X className="h-3 w-3" />
                            </span>
                          )}
                        </span>
                      </th>
                    );
                  })}
                  <th className="px-4 py-3 w-10 text-right">
                    <button
                      onClick={openColsMenu}
                      title="Customize columns"
                      className="p-1 rounded-md hover:bg-slate-200/70"
                    >
                      <Settings2 className="h-4 w-4 text-slate-400 hover:text-slate-700" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={visibleCols.length + 2} className="px-4 py-16 text-center text-slate-500">
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
              onClick={() => router.push(`/meetings?leads=${selected.join(",")}`)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white text-blue-600 hover:bg-blue-50 px-3.5 py-1.5 text-sm font-medium transition-colors"
            >
              <CalendarPlus className="h-3.5 w-3.5" /> Schedule meeting
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

    {openLeadId && (
      <LeadDetailSidebar data={openLeadData} loading={openLeadLoading} onClose={closeLead} />
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
