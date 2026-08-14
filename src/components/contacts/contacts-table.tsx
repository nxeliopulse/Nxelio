"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search, Plus, ChevronDown, ChevronRight, Users2, Mail, ArrowUpDown, ArrowUp, ArrowDown, Settings2,
  Phone, MessageSquare, Eye, MoreVertical, Star, Calendar, Filter, Grid, List,
  Pencil, RefreshCw, User, Link2, Download, FileText, FileSpreadsheet, Upload, X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { useFeedback } from "@/components/ui/feedback";
import { cn, formatDate } from "@/lib/utils";
import { EditContactModal } from "@/components/contacts/edit-contact-modal";
import { AddContactsWizard } from "@/components/contacts/add-contacts-wizard";
import { type ContactRow } from "@/lib/queries/contacts";

/** Owner picker option — same shape as accounts' AccountOwnerOption (id/name/role),
 *  kept as a local type here since Contacts has no need for the rest of that module. */
export interface OwnerOption {
  id: string;
  name: string;
  role: string;
}

// "index" (Row #) is a fixed, always-shown column — like leads-table.tsx's own Row #
// column, it is NOT part of the Manage Columns toggle system below.
type ColKey = "phone" | "tags" | "location" | "rating" | "contact" | "status" | "owner" | "created_at";

interface ColumnDef { key: ColKey; label: string; defaultOn: boolean }

// Per-column header sort — click any sortable column's arrow to sort by it, click
// again to flip direction (same mechanism as leads-table.tsx's toggleColumnSort).
// "name" isn't a ColKey (it's a fixed, always-shown column, not part of the Manage
// Columns toggle system) but is still a valid sort target, so this is its own type
// rather than reusing ColKey. "tags"/"rating" are now real columns (contacts.tags,
// contacts.rating — see 0091/0092 migrations), so they're sortable like Accounts'
// own Tags/Rating columns. "contact" (icon buttons) stays excluded — not comparable
// data, same as leads-table.tsx excludes its own icon-only columns.
type SortKey = "name" | "phone" | "tags" | "location" | "rating" | "contact" | "status" | "owner" | "created_at";

const COLUMNS: ColumnDef[] = [
  { key: "phone", label: "Phone", defaultOn: true },
  { key: "tags", label: "Tags", defaultOn: true },
  { key: "location", label: "Location", defaultOn: true },
  { key: "rating", label: "Rating", defaultOn: true },
  { key: "contact", label: "Contact", defaultOn: true },
  { key: "status", label: "Status", defaultOn: true },
  { key: "owner", label: "Owner", defaultOn: true },
  { key: "created_at", label: "Created Date", defaultOn: true },
];

const DEFAULT_COLS = COLUMNS.reduce((acc, c) => { acc[c.key] = c.defaultOn; return acc; }, {} as Record<ColKey, boolean>);
const COLS_STORAGE_KEY = "lp_contacts_columns_redesign";
const PAGE_SIZE = 15;

/** Most people never fill in a separate WhatsApp number — it's almost always
 *  the same as their phone. Prefer an explicit whatsapp value if set,
 *  otherwise fall back to phone, so Chat doesn't wrongly say "no number on
 *  file" for every contact that only has Phone filled in. */
function chatNumber(c: { whatsapp: string | null; phone: string | null }): string | null {
  return c.whatsapp || c.phone;
}


export function ContactsTable({ contacts, owners = [] }: { contacts: ContactRow[]; owners?: OwnerOption[] }) {
  const { toast } = useFeedback();
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountFilterId = searchParams.get("account");

  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  // Per-column header sort state — the toolbar "Sort By" dropdown below is just a
  // few named presets over this SAME state (see toggleColumnSort), so the dropdown
  // and the per-column header arrows always stay in sync (matches leads-table.tsx).
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  function toggleColumnSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }
  const [page, setPage] = useState(0);
  const [showImportModal, setShowImportModal] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Dropdown toggles
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [activeDateRange, setActiveDateRange] = useState("All Time");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [showCustomInputs, setShowCustomInputs] = useState(false);
  const [cardFilter, setCardFilter] = useState<"all" | "linked" | "unassigned" | "email">("all");

  // Multi-section Filter panel state — replaces the old single-select statusFilter.
  // Within a section, checking multiple values is OR; across sections with at least
  // one checked value, it's AND (see `filtered` below for the combined logic).
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedRatings, setSelectedRatings] = useState<number[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<("active" | "inactive")[]>([]);
  const [nameSearch, setNameSearch] = useState("");
  const [namesShown, setNamesShown] = useState(10);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownersShown, setOwnersShown] = useState(5);
  const [openFilterSections, setOpenFilterSections] = useState<Record<"name" | "tags" | "owner" | "location" | "rating" | "status", boolean>>({
    name: true,
    tags: false,
    owner: false,
    location: false,
    rating: false,
    status: false,
  });

  const hasActiveFilters =
    selectedContactIds.length > 0 ||
    selectedTags.length > 0 ||
    selectedOwners.length > 0 ||
    selectedLocations.length > 0 ||
    selectedRatings.length > 0 ||
    selectedStatuses.length > 0;

  function resetFilterPanel() {
    setSelectedContactIds([]);
    setSelectedTags([]);
    setSelectedOwners([]);
    setSelectedLocations([]);
    setSelectedRatings([]);
    setSelectedStatuses([]);
    setNameSearch("");
    setNamesShown(10);
    setOwnerSearch("");
    setOwnersShown(5);
  }

  function toggleFilterSection(key: "name" | "tags" | "owner" | "location" | "rating" | "status") {
    setOpenFilterSections((s) => ({ ...s, [key]: !s[key] }));
  }

  function toggleInArray<T>(arr: T[], value: T): T[] {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  const [cols, setCols] = useState<Record<ColKey, boolean>>(DEFAULT_COLS);
  const [showCols, setShowCols] = useState(false);
  const [colsPos, setColsPos] = useState<{ top: number; right: number } | null>(null);

  // Star state persisted locally
  const [starred, setStarred] = useState<string[]>([]);
  const [rowMenu, setRowMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [editingContact, setEditingContact] = useState<ContactRow | null>(null);

  useEffect(() => {
    try {
      const rawCols = localStorage.getItem(COLS_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from localStorage on mount
      if (rawCols) setCols({ ...DEFAULT_COLS, ...JSON.parse(rawCols) });

      const rawStarred = localStorage.getItem("lp_starred_contacts");
      if (rawStarred) setStarred(JSON.parse(rawStarred));
    } catch { /* ignore malformed storage */ }
  }, []);

  function toggleCol(k: ColKey) {
    setCols((c) => {
      const next = { ...c, [k]: !c[k] };
      try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function openColsMenu(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setColsPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    setShowCols(true);
  }

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarred((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem("lp_starred_contacts", JSON.stringify(next)); } catch {}
      toast(prev.includes(id) ? "Removed star from contact" : "Starred contact successfully", "success");
      return next;
    });
  };

  const visibleCols = COLUMNS.filter((c) => cols[c.key]);
  const scoped = accountFilterId ? contacts.filter((c) => c.account_id === accountFilterId) : contacts;

  // Options for the Filter panel's checkbox lists — distinct values derived from the
  // full `contacts` prop (real columns only: tags/rating are real columns per the
  // 0091/0092 migrations, not the removed hashCode-based mock).
  const distinctTags = Array.from(
    new Set(
      contacts.flatMap((c) => (c.tags || "").split(",").map((t) => t.trim()).filter(Boolean))
    )
  ).sort((a, b) => a.localeCompare(b));
  const distinctLocations = Array.from(
    new Set(contacts.map((c) => c.mailing_country).filter((v): v is string => Boolean(v)))
  ).sort((a, b) => a.localeCompare(b));
  // Rating is a fixed 1-5 scale (not a free-text field like Tags/Location), so the
  // filter always offers all 5 points regardless of which ones are currently in use
  // — same reasoning as Status always offering both Active and Inactive.
  const RATING_OPTIONS = [5, 4, 3, 2, 1];

  // Name section of the Filter panel — live search + "Load More" paging, entirely
  // client-side over the already-loaded `contacts` array (no new query needed).
  const filteredNameList = contacts.filter((c) =>
    `${c.first_name} ${c.last_name}`.toLowerCase().includes(nameSearch.trim().toLowerCase())
  );
  const visibleNameList = filteredNameList.slice(0, namesShown);

  // Owner section of the Filter panel — same live search + "Load More" paging as
  // Name, since a workspace's owner/user list can also run long.
  const filteredOwnerList = owners.filter((o) => o.name.toLowerCase().includes(ownerSearch.trim().toLowerCase()));
  const visibleOwnerList = filteredOwnerList.slice(0, ownersShown);

  // Apply filters
  // Apply base filters (all filters except cardFilter)
  const baseFiltered = scoped.filter((c) => {
    const q = search.toLowerCase();

    // Date range filter
    if (activeDateRange !== "All Time") {
      const date = new Date(c.created_at);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      if (activeDateRange === "Today") {
        if (date < todayStart) return false;
      } else if (activeDateRange === "Yesterday") {
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        if (date < yesterdayStart || date >= todayStart) return false;
      } else if (activeDateRange === "Last 7 Days") {
        const sevenDaysAgo = new Date(todayStart);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        if (date < sevenDaysAgo) return false;
      } else if (activeDateRange === "Last 30 Days") {
        const thirtyDaysAgo = new Date(todayStart);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (date < thirtyDaysAgo) return false;
      } else if (activeDateRange === "This Month") {
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        if (date < thisMonthStart) return false;
      } else if (activeDateRange === "Last Month") {
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        if (date < lastMonthStart || date >= thisMonthStart) return false;
      } else if (activeDateRange === "Custom Range") {
        if (customDateFrom) {
          const fromDate = new Date(customDateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (date < fromDate) return false;
        }
        if (customDateTo) {
          const toDate = new Date(customDateTo);
          toDate.setHours(23, 59, 59, 999);
          if (date > toDate) return false;
        }
      }
    }

    // Filter panel: Name (specific contacts) — checking one or more names restricts
    // the table to ONLY those contacts.
    if (selectedContactIds.length > 0 && !selectedContactIds.includes(c.id)) return false;

    // Filter panel: Tags — OR within the section (contact matches if ANY of its own
    // tags is checked).
    if (selectedTags.length > 0) {
      const rowTags = (c.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
      if (!rowTags.some((t) => selectedTags.includes(t))) return false;
    }

    // Filter panel: Owner
    if (selectedOwners.length > 0 && !selectedOwners.includes(c.contact_owner || "")) return false;

    // Filter panel: Location
    if (selectedLocations.length > 0 && !selectedLocations.includes(c.mailing_country || "")) return false;

    // Filter panel: Rating
    if (selectedRatings.length > 0 && (c.rating == null || !selectedRatings.includes(c.rating))) return false;

    // Filter panel: Status — same email_opt_out derivation as the rest of the table
    // (true -> inactive, false -> active), not a new status concept.
    if (selectedStatuses.length > 0) {
      const status = c.email_opt_out ? "inactive" : "active";
      if (!selectedStatuses.includes(status)) return false;
    }

    // Search query
    if (!q) return true;
    const name = `${c.first_name} ${c.last_name}`.toLowerCase();
    return (
      name.includes(q) ||
      (c.email?.toLowerCase().includes(q) ?? false) ||
      (c.job_title?.toLowerCase().includes(q) ?? false) ||
      (c.phone?.toLowerCase().includes(q) ?? false) ||
      (c.mailing_country?.toLowerCase().includes(q) ?? false)
    );
  });

  const filtered = baseFiltered.filter((c) => {
    // Card Filter
    if (cardFilter === "linked" && !c.account_id) return false;
    if (cardFilter === "unassigned" && c.account_id) return false;
    if (cardFilter === "email" && !c.email) return false;
    return true;
  });

  /** Plain-text value of a sortable column. Owner resolves through the `owners` list
   *  (contact_owner is a UUID, not a display name) rather than sorting by raw id. */
  function getSortText(key: Exclude<SortKey, "created_at" | "status" | "rating">, c: ContactRow): string {
    switch (key) {
      case "name": return `${c.first_name} ${c.last_name}`.trim();
      case "phone": return c.phone || "";
      case "tags": return c.tags || "";
      case "location": return c.mailing_country || "";
      case "contact": return c.email || "";
      case "owner": return owners.find((o) => o.id === c.contact_owner)?.name || "";
      default: return "";
    }
  }

  /** String comparator that always sorts blank values (missing phone/location/owner)
   *  to the end, in BOTH ascending and descending order — otherwise an empty string
   *  would sort first ascending and last descending, scattering "no data" rows
   *  unpredictably instead of keeping them out of the way. */
  function compareTextBlankLast(av: string, bv: string, dir: "asc" | "desc"): number {
    const aBlank = !av.trim();
    const bBlank = !bv.trim();
    if (aBlank && bBlank) return 0;
    if (aBlank) return 1;
    if (bBlank) return -1;
    const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
    return dir === "asc" ? cmp : -cmp;
  }

  // Apply sorting — per-column header arrows and the toolbar "Sort By" dropdown both
  // drive sortKey/sortDir, so there is exactly one sort mechanism, never two that
  // could disagree.
  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    // Created Date must compare actual timestamps, not display text.
    if (sortKey === "created_at") {
      const cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    }
    // Status is a derived-but-real field (email_opt_out) — Active sorts before
    // Inactive ascending, a deliberate, consistent ordering choice (no natural
    // alphabetical/numeric order exists for a 2-value status).
    if (sortKey === "status") {
      const rank = (c: ContactRow) => (c.email_opt_out ? 1 : 0);
      const cmp = rank(a) - rank(b);
      return sortDir === "asc" ? cmp : -cmp;
    }
    // Rating is numeric (1-5), not text — blanks (no rating set) always sort last.
    if (sortKey === "rating") {
      const aBlank = a.rating == null;
      const bBlank = b.rating == null;
      if (aBlank && bBlank) return 0;
      if (aBlank) return 1;
      if (bBlank) return -1;
      const cmp = a.rating! - b.rating!;
      return sortDir === "asc" ? cmp : -cmp;
    }
    return compareTextBlankLast(getSortText(sortKey, a), getSortText(sortKey, b), sortDir);
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((c) => c.id));

  function openContact(id: string) {
    router.push(`/contacts/${id}`);
  }

  const AVATAR_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-cyan-500", "bg-pink-500", "bg-indigo-500"];

  function initials(c: ContactRow): string {
    const first = c.first_name || "";
    const last = c.last_name || "";
    if (first && last) {
      return (first[0] + last[0]).toUpperCase();
    }
    return first.slice(0, 2).toUpperCase() || last.slice(0, 2).toUpperCase() || "?";
  }

  function avatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  /** Small inline per-column sort-arrow button for a table header — neutral gray
   *  ArrowUpDown when this column isn't the active sort, or a colored ArrowUp/
   *  ArrowDown when it is (matches leads-table.tsx's header sort icon exactly). */
  function renderSortIcon(key: SortKey, label: string) {
    const isSorted = sortKey === key;
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggleColumnSort(key); }}
        title={`Sort by ${label}`}
        className={cn("p-0.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 flex-shrink-0", isSorted && "text-blue-600 dark:text-blue-400")}
      >
        {isSorted ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-400" />
        )}
      </button>
    );
  }

  /** Whether a "Sort By" dropdown preset matches the current sortKey/sortDir —
   *  drives its highlighted/active state. Presets are just shortcuts onto the same
   *  shared state the header arrows use, so an option can also go "unselected" (no
   *  highlight) when the user has sorted by a column the dropdown has no preset for
   *  (e.g. Phone, Location, Owner, Status) — the table still sorts correctly either way. */
  function isActiveSortPreset(key: "none" | "name_az" | "name_za" | "newest"): boolean {
    switch (key) {
      case "none": return !sortKey;
      case "name_az": return sortKey === "name" && sortDir === "asc";
      case "name_za": return sortKey === "name" && sortDir === "desc";
      case "newest": return sortKey === "created_at" && sortDir === "desc";
    }
  }

  /** Shared shell for the Filter panel's plain checkbox-list sections (Tags/Owner
   *  are handled separately since they need search+load-more; here, checking
   *  multiple values is OR (handled by the caller's `onToggle`/selected-values logic
   *  feeding into `filtered` above); this helper only renders the UI shell. */
  function renderFilterSection<T extends string | number>(
    key: "tags" | "owner" | "location" | "rating" | "status",
    label: string,
    options: { value: T; label: string }[],
    selectedValues: T[],
    onToggle: (value: T) => void
  ) {
    const isOpen = openFilterSections[key];
    return (
      <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
        <button
          type="button"
          onClick={() => toggleFilterSection(key)}
          className="w-full flex items-center justify-between text-left font-bold text-slate-700 dark:text-slate-600"
        >
          <span>{label}</span>
          <ChevronRight className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", isOpen && "rotate-90")} />
        </button>
        {isOpen && (
          <div className="mt-2 max-h-36 overflow-y-auto space-y-1 pr-1">
            {options.length === 0 && <p className="text-slate-400 dark:text-slate-500 py-1 text-xs">No options available.</p>}
            {options.map((opt) => (
              <label key={String(opt.value)} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(opt.value)}
                  onChange={() => onToggle(opt.value)}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer"
                />
                <span className="truncate text-slate-700 dark:text-slate-600 font-medium">{opt.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 pb-10 text-slate-800 dark:text-slate-700">

      {/* Redesigned Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Contacts</h1>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold mt-1">
            <Link href="/dashboard" className="hover:text-slate-600">Home</Link>
            <span>&gt;</span>
            <span className="text-slate-600 dark:text-slate-600">Contacts</span>
          </div>
        </div>

        {/* Top Header Actions */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Export Dropdown */}
          <div className="relative">
            <Button
              size="sm"
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              className="h-8 rounded-md bg-[var(--primary)] hover:opacity-90 text-white text-xs font-semibold gap-1.5"
            >
              <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            {exportDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportDropdownOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-40 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
                  <button
                    onClick={() => {
                      toast("Exporting PDF contacts...", "info");
                      setExportDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-600"
                  >
                    <FileText className="h-3.5 w-3.5 text-slate-400" /> Export as PDF
                  </button>
                  <button
                    onClick={() => {
                      toast("Exporting Excel contacts...", "info");
                      setExportDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-600"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" /> Export as Excel
                  </button>
                </div>
              </>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportModal(true)}
            className="h-8 w-8 p-0 rounded-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            title="Import from CSV"
          >
            <Upload className="h-4 w-4 text-slate-500" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toast("Refreshing contacts...", "info");
              router.refresh();
              setTimeout(() => window.location.reload(), 100);
            }}
            className="h-8 w-8 p-0 rounded-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4 text-slate-500" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total contacts", value: baseFiltered.length, icon: Users2, accent: "bg-amber-500", key: "all", ring: "ring-amber-500", bg: "bg-amber-500/[0.04] dark:bg-amber-500/[0.08]" },
          { label: "Linked to account", value: baseFiltered.filter((c) => c.account_id).length, icon: Link2, accent: "bg-blue-500", key: "linked", ring: "ring-blue-500", bg: "bg-blue-50/[0.04] dark:bg-blue-50/[0.08]" },
          { label: "Unassigned", value: baseFiltered.filter((c) => !c.account_id).length, icon: User, accent: "bg-rose-500", key: "unassigned", ring: "ring-rose-500", bg: "bg-rose-500/[0.04] dark:bg-rose-500/[0.08]" },
          { label: "With email", value: baseFiltered.filter((c) => c.email).length, icon: Mail, accent: "bg-emerald-500", key: "email", ring: "ring-emerald-500", bg: "bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08]" },
        ].map((s) => {
          const Icon = s.icon;
          const active = cardFilter === s.key;
          return (
            <Card
              key={s.label}
              onClick={() => {
                setCardFilter(s.key as any);
                setPage(0);
              }}
              className={cn(
                "p-4 sm:p-5 flex items-center gap-3 cursor-pointer select-none transition-all duration-200 hover:scale-[1.02] hover:shadow-xs",
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
                <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">{s.value.toLocaleString()}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Redesigned Sub-header / Actions Controls bar: Row 1 */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 p-3 sm:p-4 rounded-xl shadow-2xs">
        
        {/* Left Side: Search */}
        <div className="w-full md:w-auto flex-grow max-w-sm">
          <Input
            leftIcon={<Search className="h-3.5 w-3.5 text-slate-400" />}
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs rounded-lg bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-2xs"
          />
        </div>

        {/* Right Side: Filter, Columns, Toggle Grid */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">

          {/* Filter Dropdown */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
              className={cn(
                "h-8 rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-semibold gap-1.5 shadow-2xs",
                hasActiveFilters && "ring-1 ring-blue-500/30 border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40"
              )}
            >
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <span>Filter</span>
              <ChevronDown className="h-3 w-3 text-slate-450" />
              {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
            </Button>
            {filterDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-80 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg z-50 text-xs flex flex-col max-h-[36rem]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
                  <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-white text-sm">
                    <Filter className="h-3.5 w-3.5 text-slate-500" /> Filter
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilterDropdownOpen(false)}
                    className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                    title="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Sections */}
                <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
                  {/* Name — collapsible like the other sections, but open by default;
                      live search + checkbox list. */}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleFilterSection("name")}
                      className="w-full flex items-center justify-between text-left font-bold text-slate-700 dark:text-slate-600 mb-2"
                    >
                      <span>Name</span>
                      <ChevronRight className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", openFilterSections.name && "rotate-90")} />
                    </button>
                    {openFilterSections.name && (
                      <>
                        <Input
                          leftIcon={<Search className="h-3.5 w-3.5 text-slate-400" />}
                          placeholder="Search names"
                          value={nameSearch}
                          onChange={(e) => { setNameSearch(e.target.value); setNamesShown(10); }}
                          className="h-8 text-xs rounded-lg bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-2xs mb-2"
                        />
                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                          {visibleNameList.length === 0 && (
                            <p className="text-slate-400 dark:text-slate-500 py-1.5 text-center">No contacts found.</p>
                          )}
                          {visibleNameList.map((c) => {
                            const fullName = `${c.first_name} ${c.last_name}`.trim();
                            const checked = selectedContactIds.includes(c.id);
                            return (
                              <label key={c.id} className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => setSelectedContactIds((s) => toggleInArray(s, c.id))}
                                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer"
                                />
                                {c.photo_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URL, not a static asset
                                  <img src={c.photo_url} alt="" className="h-6 w-6 rounded-full object-cover flex-shrink-0" />
                                ) : (
                                  <span className={cn("h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0", avatarColor(fullName))}>
                                    {initials(c)}
                                  </span>
                                )}
                                <span className="truncate text-slate-700 dark:text-slate-600 font-medium">{fullName}</span>
                              </label>
                            );
                          })}
                        </div>
                        {filteredNameList.length > namesShown && (
                          <button
                            type="button"
                            onClick={() => setNamesShown((n) => n + 10)}
                            className="mt-1.5 text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                          >
                            Load More
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {renderFilterSection(
                    "tags",
                    "Tags",
                    distinctTags.map((t) => ({ value: t, label: t })),
                    selectedTags,
                    (v) => setSelectedTags((s) => toggleInArray(s, v))
                  )}
                  {/* Owner — like Name, this can run long (every workspace user), so it
                      gets its own live search + "Load More" instead of the plain
                      checkbox list the other sections use. */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                    <button
                      type="button"
                      onClick={() => toggleFilterSection("owner")}
                      className="w-full flex items-center justify-between text-left font-bold text-slate-700 dark:text-slate-600"
                    >
                      <span>Owner</span>
                      <ChevronRight className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", openFilterSections.owner && "rotate-90")} />
                    </button>
                    {openFilterSections.owner && (
                      <div className="mt-2">
                        <Input
                          leftIcon={<Search className="h-3.5 w-3.5 text-slate-400" />}
                          placeholder="Search"
                          value={ownerSearch}
                          onChange={(e) => { setOwnerSearch(e.target.value); setOwnersShown(5); }}
                          className="h-8 text-xs rounded-lg bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-2xs mb-2"
                        />
                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                          {visibleOwnerList.length === 0 && (
                            <p className="text-slate-400 dark:text-slate-500 py-1.5 text-center">No owners found.</p>
                          )}
                          {visibleOwnerList.map((o) => (
                            <label key={o.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedOwners.includes(o.id)}
                                onChange={() => setSelectedOwners((s) => toggleInArray(s, o.id))}
                                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer"
                              />
                              <span className="truncate text-slate-700 dark:text-slate-600 font-medium">{o.name}</span>
                            </label>
                          ))}
                        </div>
                        {filteredOwnerList.length > ownersShown && (
                          <button
                            type="button"
                            onClick={() => setOwnersShown((n) => n + 5)}
                            className="mt-1.5 text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                          >
                            Load More
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {renderFilterSection(
                    "location",
                    "Location",
                    distinctLocations.map((l) => ({ value: l, label: l })),
                    selectedLocations,
                    (v) => setSelectedLocations((s) => toggleInArray(s, v))
                  )}
                  {/* Rating — shows real star icons (filled amber up to the rating
                      value, gray for the rest) instead of plain "N Stars" text. */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                    <button
                      type="button"
                      onClick={() => toggleFilterSection("rating")}
                      className="w-full flex items-center justify-between text-left font-bold text-slate-700 dark:text-slate-600"
                    >
                      <span>Rating</span>
                      <ChevronRight className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", openFilterSections.rating && "rotate-90")} />
                    </button>
                    {openFilterSections.rating && (
                      <div className="mt-2 space-y-1 pr-1">
                        {RATING_OPTIONS.map((r) => (
                          <label key={r} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedRatings.includes(r)}
                              onChange={() => setSelectedRatings((s) => toggleInArray(s, r))}
                              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer"
                            />
                            <span className="flex items-center gap-0.5">
                              {Array.from({ length: 5 }, (_, i) => (
                                <Star key={i} className={cn("h-3.5 w-3.5", i < r ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600")} />
                              ))}
                            </span>
                            <span className="text-slate-700 dark:text-slate-600 font-medium">{r.toFixed(1)}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  {renderFilterSection(
                    "status",
                    "Status",
                    [
                      { value: "active" as const, label: "Active" },
                      { value: "inactive" as const, label: "Inactive" },
                    ],
                    selectedStatuses,
                    (v) => setSelectedStatuses((s) => toggleInArray(s, v))
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetFilterPanel}
                    className="h-8 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  >
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setFilterDropdownOpen(false);
                      toast("Filters applied", "success");
                    }}
                    className="h-8 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Filter
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Manage Columns Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={openColsMenu}
            className="rounded-lg gap-1.5 font-semibold h-8 text-xs px-2.5 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xs"
            title="Manage Columns"
          >
            <Settings2 className="h-3.5 w-3.5 text-slate-500" />
            <span>Manage Columns</span>
          </Button>

          {/* Layout Grid / List Toggler */}
          <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 shadow-2xs bg-slate-50/50 dark:bg-slate-900">
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1 rounded-md transition-colors",
                viewMode === "list" ? "bg-[var(--primary)] text-white" : "text-slate-550 dark:text-slate-500 hover:text-slate-700"
              )}
              title="List View"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1 rounded-md transition-colors",
                viewMode === "grid" ? "bg-[var(--primary)] text-white" : "text-slate-550 dark:text-slate-500 hover:text-slate-700"
              )}
              title="Grid View"
            >
              <Grid className="h-3.5 w-3.5" />
            </button>
          </div>

        </div>
      </div>

      {/* Redesigned Sub-header / Actions Controls bar: Row 2 */}
      <div className="flex flex-wrap items-center gap-2 mb-5 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 p-3 sm:p-4 rounded-xl shadow-2xs w-full">

        {/* Count Chip */}
        <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[var(--muted)] px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-600 flex-shrink-0 whitespace-nowrap">
          <Users2 className="h-3.5 w-3.5 text-slate-400" />
          <span>
            {filtered.length}{" "}
            {cardFilter === "linked"
              ? "Linked Contact"
              : cardFilter === "unassigned"
              ? "Unassigned Contact"
              : cardFilter === "email"
              ? "Contact with Email"
              : "Contact"}
            {filtered.length === 1 ? "" : "s"}
          </span>
          {cardFilter !== "all" && (
            <button
              onClick={() => { setCardFilter("all"); setPage(0); }}
              title="Clear filter"
              className="p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 cursor-pointer ml-1"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Sort By Dropdown Button */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
            className="h-8 rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-semibold gap-1.5 shadow-2xs"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
            <span>
              Sort By: {
                !sortKey ? "None"
                : sortKey === "name" && sortDir === "asc" ? "Name A-Z"
                : sortKey === "name" && sortDir === "desc" ? "Name Z-A"
                : sortKey === "created_at" && sortDir === "desc" ? "Newest"
                : "Custom"
              }
            </span>
            <ChevronDown className="h-3 w-3 text-slate-450" />
          </Button>
          {sortDropdownOpen && (
            <div className="absolute left-0 mt-1.5 w-40 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs">
              {(
                [
                  { key: "none", label: "None" },
                  { key: "name_az", label: "Name A-Z" },
                  { key: "name_za", label: "Name Z-A" },
                  { key: "newest", label: "Newest" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => {
                    if (opt.key === "none") { setSortKey(null); setSortDir("asc"); }
                    else if (opt.key === "name_az") { setSortKey("name"); setSortDir("asc"); }
                    else if (opt.key === "name_za") { setSortKey("name"); setSortDir("desc"); }
                    else if (opt.key === "newest") { setSortKey("created_at"); setSortDir("desc"); }
                    setSortDropdownOpen(false);
                    toast(`Sorted contacts by ${opt.label}`, "success");
                  }}
                  className={cn(
                    "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                    isActiveSortPreset(opt.key) ? "text-[var(--primary)] bg-[var(--primary)]/10 dark:bg-[var(--primary)]/15" : "text-slate-700 dark:text-slate-600"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date Picker Button */}
        <div className="relative">
          <button
            onClick={() => setDateRangeOpen(!dateRangeOpen)}
            className="h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-600 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            <span>
              {activeDateRange === "Custom Range"
                ? (customDateFrom || customDateTo
                  ? `${customDateFrom ? formatDate(customDateFrom) : "..."} - ${customDateTo ? formatDate(customDateTo) : "..."}`
                  : "Custom Range")
                : activeDateRange}
            </span>
            <ChevronDown className="h-3 w-3 text-slate-400 ml-1" />
          </button>
          {dateRangeOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => { setDateRangeOpen(false); setShowCustomInputs(false); }} />
              <div className="absolute left-0 mt-1.5 w-60 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs overflow-hidden">
                {showCustomInputs ? (
                  <div className="p-3 space-y-2">
                    <p className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">Custom Range</p>
                    <div className="flex items-center gap-1">
                      <input
                        type="date"
                        value={customDateFrom}
                        onChange={(e) => setCustomDateFrom(e.target.value)}
                        className="w-full h-8 rounded border border-slate-200 dark:border-slate-850 px-1.5 py-0.5 text-[11px] text-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-blue-200"
                        aria-label="From date"
                      />
                      <span className="text-[10px] text-slate-400">to</span>
                      <input
                        type="date"
                        value={customDateTo}
                        onChange={(e) => setCustomDateTo(e.target.value)}
                        className="w-full h-8 rounded border border-slate-200 dark:border-slate-850 px-1.5 py-0.5 text-[11px] text-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-blue-200"
                        aria-label="To date"
                      />
                    </div>
                    <div className="flex justify-end gap-1.5 pt-1">
                      <button
                        onClick={() => setShowCustomInputs(false)}
                        className="px-2.5 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-55 dark:hover:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-800"
                      >
                        Back
                      </button>
                      <button
                        onClick={() => {
                          setActiveDateRange("Custom Range");
                          setDateRangeOpen(false);
                          setShowCustomInputs(false);
                          toast("Custom date range applied", "success");
                        }}
                        className="px-2.5 py-1 text-[10px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {["All Time", "Today", "Yesterday", "Last 7 Days", "Last 30 Days", "This Month", "Last Month", "Custom Range"].map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          if (opt === "Custom Range") {
                            setShowCustomInputs(true);
                          } else {
                            setActiveDateRange(opt);
                            setDateRangeOpen(false);
                            toast(`Date range updated to ${opt}`, "success");
                          }
                        }}
                        className={cn(
                          "w-full text-left px-4 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                          activeDateRange === opt ? "text-[var(--primary)] bg-[var(--primary)]/10 dark:bg-[var(--primary)]/15" : "text-slate-700 dark:text-slate-600"
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* FILTER NOTIFICATION BANNER */}
      {accountFilterId && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-2">
          <p className="text-xs text-blue-950 dark:text-blue-200 font-semibold">
            Showing <span className="font-bold">{scoped.length}</span> contact{scoped.length === 1 ? "" : "s"} for this account
          </p>
          <Link href="/contacts" className="text-xs font-bold text-blue-700 dark:text-blue-300 hover:underline">Clear filter ✕</Link>
        </div>
      )}

      {/* RENDER VIEW: LIST OR GRID */}
      {viewMode === "list" ? (
        <Card className="overflow-hidden bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl">
          <div className="overflow-x-auto w-full">
            <DataTable className="min-w-[1000px] w-full text-slate-800 dark:text-slate-700">
              <DataTableHead className="sticky top-0 z-10 bg-slate-50/50 dark:bg-[var(--muted)] border-b border-slate-200/80 dark:border-slate-800">
                <tr className="text-left text-xs uppercase font-bold text-slate-500 dark:text-slate-500">
                  <DataTableTh className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.length === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer"
                    />
                  </DataTableTh>
                  {/* Row # — fixed, always shown, not part of the Manage Columns toggle system (matches leads-table.tsx) */}
                  <DataTableTh className="w-10 px-3 py-2.5">#</DataTableTh>
                  <DataTableTh className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1">Name{renderSortIcon("name", "Name")}</span>
                  </DataTableTh>
                  {cols.phone && (
                    <DataTableTh className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1">Phone{renderSortIcon("phone", "Phone")}</span>
                    </DataTableTh>
                  )}
                  {cols.tags && (
                    <DataTableTh className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1">Tags{renderSortIcon("tags", "Tags")}</span>
                    </DataTableTh>
                  )}
                  {cols.location && (
                    <DataTableTh className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1">Location{renderSortIcon("location", "Location")}</span>
                    </DataTableTh>
                  )}
                  {cols.rating && (
                    <DataTableTh className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1">Rating{renderSortIcon("rating", "Rating")}</span>
                    </DataTableTh>
                  )}
                  {/* Contact is icon buttons (mail/phone/message/eye) — sorts by email,
                      the most meaningful of the four fields behind those icons. */}
                  {cols.contact && (
                    <DataTableTh className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center gap-1 justify-center">Contact{renderSortIcon("contact", "Contact")}</span>
                    </DataTableTh>
                  )}
                  {cols.status && (
                    <DataTableTh className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1">Status{renderSortIcon("status", "Status")}</span>
                    </DataTableTh>
                  )}
                  {cols.owner && (
                    <DataTableTh className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1">Owner{renderSortIcon("owner", "Owner")}</span>
                    </DataTableTh>
                  )}
                  {cols.created_at && (
                    <DataTableTh className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1">Created Date{renderSortIcon("created_at", "Created Date")}</span>
                    </DataTableTh>
                  )}
                  <DataTableTh className="w-12 px-3 py-2.5 text-center">Action</DataTableTh>
                </tr>
              </DataTableHead>
              <DataTableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.length === 0 && (
                  <DataTableEmpty colSpan={visibleCols.length + 4}>
                    No contacts found matching the filters.
                  </DataTableEmpty>
                )}
                {paged.map((c, i) => {
                  const isStarred = starred.includes(c.id);
                  const isChecked = selected.includes(c.id);
                  
                  // Derived flags/status; Tags and Rating now come straight off the
                  // real contact record (contacts.tags, contacts.rating), no mock.
                  const rowTags = (c.tags || "").split(",").map((t) => t.trim()).filter(Boolean);

                  const countryName = c.mailing_country || null;

                  const status = c.email_opt_out ? "Inactive" : "Active";
                  const statusColor = status === "Active"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400";

                  return (
                    <DataTableRow
                      key={c.id}
                      onClick={() => openContact(c.id)}
                      className={cn(
                        "cursor-pointer text-xs font-semibold hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors",
                        isChecked && "bg-blue-50/20 dark:bg-blue-950/10"
                      )}
                    >
                      {/* Checkbox column */}
                      <DataTableTd onClick={(e) => e.stopPropagation()} className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggle(c.id)}
                          className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer"
                        />
                      </DataTableTd>

                      {/* Row # column — fixed, always shown */}
                      <td className="px-3 py-2.5 text-slate-400 dark:text-slate-500 tabular-nums font-mono text-xs">
                        {safePage * PAGE_SIZE + i + 1}
                      </td>

                      {/* Name with star & Avatar details */}
                      <DataTableTd className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => toggleStar(c.id, e)}
                            className="p-1 rounded-md text-slate-350 hover:text-amber-500 transition-colors"
                          >
                            <Star className={cn("h-4 w-4", isStarred ? "fill-amber-500 text-amber-500" : "text-slate-400")} />
                          </button>
                          
                          <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 shadow-2xs", avatarColor(`${c.first_name} ${c.last_name}`))}>
                            {initials(c)}
                          </div>
                          
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 dark:text-white truncate whitespace-nowrap mb-0.5 leading-none group-hover:text-blue-500">
                              {c.first_name} {c.last_name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium truncate leading-none">
                              {c.job_title || "Facility Manager"}
                            </p>
                          </div>
                        </div>
                      </DataTableTd>

                      {/* Phone Column */}
                      {cols.phone && (
                        <td className="px-3 py-2.5 whitespace-nowrap font-medium">
                          {c.phone ? (
                            <span className="text-slate-500 dark:text-slate-500">{c.phone}</span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditingContact(c); }}
                              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/70 whitespace-nowrap"
                            >
                              <Plus className="h-3 w-3" /> Add phone
                            </button>
                          )}
                        </td>
                      )}

                      {/* Tags Column */}
                      {cols.tags && (
                        <td className="px-3 py-2.5">
                          {rowTags.length ? (
                            <div className="flex flex-wrap gap-1 max-w-[160px]">
                              {rowTags.slice(0, 2).map((t) => (
                                <span key={t} className="px-2 py-0.5 rounded text-[10px] font-bold border text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800/40 dark:text-blue-400 whitespace-nowrap">
                                  {t}
                                </span>
                              ))}
                              {rowTags.length > 2 && <span className="text-[10px] text-slate-400 font-semibold">+{rowTags.length - 2}</span>}
                            </div>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-700">—</span>
                          )}
                        </td>
                      )}

                      {/* Location Column */}
                      {cols.location && (
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-500 font-medium">
                          {countryName ? <span>{countryName}</span> : <span className="text-slate-300 dark:text-slate-700">—</span>}
                        </td>
                      )}

                      {/* Rating Column */}
                      {cols.rating && (
                        <td className="px-3 py-2.5">
                          {c.rating != null ? (
                            <div className="flex items-center gap-1 font-bold text-slate-700 dark:text-slate-350">
                              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 flex-shrink-0" />
                              <span>{c.rating}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-700">—</span>
                          )}
                        </td>
                      )}

                      {/* Contact Icons Column */}
                      {cols.contact && (
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            <a
                              href={c.email ? `mailto:${c.email}` : "#"}
                              onClick={() => c.email && toast(`Opening mailto link for ${c.email}`, "success")}
                              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                              title={c.email || "No Email"}
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </a>
                            <a
                              href={c.phone ? `tel:${c.phone}` : "#"}
                              onClick={() => c.phone && toast(`Opening call dialer for ${c.phone}`, "success")}
                              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                              title={c.phone || "No Phone"}
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                            <a
                              href={chatNumber(c) ? `https://wa.me/${chatNumber(c)!.replace(/\D/g, "")}` : "#"}
                              onClick={(e) => { if (!chatNumber(c)) { e.preventDefault(); toast("This contact has no phone or WhatsApp number on file.", "error"); } }}
                              target={chatNumber(c) ? "_blank" : undefined}
                              rel="noopener noreferrer"
                              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-purple-500 dark:hover:text-purple-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                              title={chatNumber(c) ? "Message on WhatsApp" : "No phone or WhatsApp number"}
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </a>
                            <button
                              onClick={() => openContact(c.id)}
                              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                              title="Details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}

                      {/* Status Column */}
                      {cols.status && (
                        <td className="px-3 py-2.5">
                          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", statusColor)}>
                            {status}
                          </span>
                        </td>
                      )}

                      {/* Owner Column — contact_owner is a UUID (contacts.contact_owner references
                          users.user_id), not a name — look up the display name via the owners prop.
                          A former team member no longer in `owners` renders as "Unassigned" rather
                          than a raw id. */}
                      {cols.owner && (() => {
                        const owner = owners.find((o) => o.id === c.contact_owner);
                        return (
                        <td className="px-3 py-2.5">
                          {owner ? (
                            <span
                              className="flex items-center gap-1.5 max-w-[140px]"
                              title={owner.role}
                            >
                              <span className={cn("h-5 w-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0", avatarColor(owner.name))}>
                                {owner.name.trim()[0]?.toUpperCase() || "?"}
                              </span>
                              <span className="truncate text-slate-600 dark:text-slate-500 whitespace-nowrap">{owner.name}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs whitespace-nowrap">Unassigned</span>
                          )}
                        </td>
                        );
                      })()}

                      {/* Created Date Column */}
                      {cols.created_at && (
                        <td className="px-3 py-2.5 text-slate-500 dark:text-slate-500 text-xs whitespace-nowrap">
                          {formatDate(c.created_at)}
                        </td>
                      )}

                      {/* Action Menu Column */}
                      <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setRowMenu({ id: c.id, top: r.bottom + 4, left: Math.max(8, r.right - 140) });
                          }}
                          title="Row actions"
                          className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm"
                        >
                          <MoreVertical className="h-4 w-4 text-slate-400" />
                        </button>
                      </td>

                    </DataTableRow>
                  );
                })}
              </DataTableBody>
            </DataTable>
          </div>
        </Card>
      ) : (
        /* Redesigned Contacts Grid View Mode */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE).map((c) => {
            const isStarred = starred.includes(c.id);
            const rowTags = (c.tags || "").split(",").map((t) => t.trim()).filter(Boolean);

            const countryName = c.mailing_country || null;

            const status = c.email_opt_out ? "Inactive" : "Active";
            const statusColor = status === "Active"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
              : "bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400";

            return (
              <Card
                key={c.id}
                onClick={() => openContact(c.id)}
                className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl p-4 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors flex flex-col justify-between relative group"
              >
                {/* Star top-left & Status top-right */}
                <div className="flex justify-between items-center mb-3">
                  <button
                    type="button"
                    onClick={(e) => toggleStar(c.id, e)}
                    className="p-1 rounded-md text-slate-300 hover:text-amber-500"
                  >
                    <Star className={cn("h-4 w-4", isStarred ? "fill-amber-500 text-amber-500" : "text-slate-400")} />
                  </button>
                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", statusColor)}>
                    {status}
                  </span>
                </div>

                {/* Profile Avatar, Name, Job title */}
                <div className="flex flex-col items-center text-center mb-4 flex-1">
                  <div className={cn("h-14 w-14 rounded-full flex items-center justify-center text-white text-base font-bold shadow-sm mb-2.5", avatarColor(`${c.first_name} ${c.last_name}`))}>
                    {initials(c)}
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug group-hover:text-blue-500">
                    {c.first_name} {c.last_name}
                  </h4>
                  <p className="text-xs text-slate-400 font-semibold mt-1">{c.job_title || "Facility Manager"}</p>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 space-y-2 text-xs font-semibold">
                  {/* Phone / Location / Rating */}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Phone:</span>
                    <span className="text-slate-800 dark:text-slate-700">{c.phone || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Location:</span>
                    <span className="text-slate-800 dark:text-slate-700">
                      {countryName || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Rating:</span>
                    <span className="text-slate-800 dark:text-slate-700 flex items-center gap-1">
                      {c.rating != null ? (
                        <>
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          <span>{c.rating}</span>
                        </>
                      ) : "—"}
                    </span>
                  </div>
                  {rowTags.length > 0 && (
                    <div className="flex justify-between items-start">
                      <span className="text-slate-400 flex-shrink-0">Tags:</span>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {rowTags.slice(0, 2).map((t) => (
                          <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-bold border text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800/40 dark:text-blue-400">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Grid contact quick action footer */}
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-3 flex items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                  <a
                    href={c.email ? `mailto:${c.email}` : "#"}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-blue-500 hover:bg-slate-50"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                  <a
                    href={c.phone ? `tel:${c.phone}` : "#"}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-emerald-500 hover:bg-slate-50"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                  <a
                    href={chatNumber(c) ? `https://wa.me/${chatNumber(c)!.replace(/\D/g, "")}` : "#"}
                    onClick={(e) => { if (!chatNumber(c)) { e.preventDefault(); toast("This contact has no phone or WhatsApp number on file.", "error"); } }}
                    target={chatNumber(c) ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-purple-500 hover:bg-slate-50"
                    title={chatNumber(c) ? "Message on WhatsApp" : "No phone or WhatsApp number"}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </a>
                  <button
                    onClick={() => openContact(c.id)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-indigo-500 hover:bg-slate-50"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination component */}
      <div className="mt-5">
        <Pagination page={safePage + 1} totalPages={pageCount} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={(p) => setPage(p - 1)} />
      </div>

      {/* Modal overlays */}
      {editingContact && (
        <EditContactModal open={true} onClose={() => setEditingContact(null)} contact={editingContact} owners={owners} />
      )}
      <AddContactsWizard open={showImportModal} onClose={() => setShowImportModal(false)} />

      {/* Row actions menu — kebab button in the rightmost column */}
      {rowMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} />
          <div className="fixed z-50 w-36 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-1" style={{ top: rowMenu.top, left: rowMenu.left }}>
            <button
              onClick={() => {
                const contact = contacts.find((x) => x.id === rowMenu.id);
                setRowMenu(null);
                if (contact) setEditingContact(contact);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          </div>
        </>
      )}

      {/* Columns customizer floating panel */}
      {showCols && colsPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowCols(false)} />
          <div className="fixed z-50 w-60 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-2" style={{ top: colsPos.top, right: colsPos.right }}>
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Show columns</p>
            <div className="max-h-80 overflow-y-auto">
              {COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-sm text-slate-700 dark:text-slate-600 font-semibold">
                  <input type="checkbox" checked={cols[c.key]} onChange={() => toggleCol(c.key)} className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition duration-150 ease-in-out cursor-pointer" />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Bulk actions status panel floating */}
      {selected.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 lp-anim-pop max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-3 rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/30 pl-5 pr-3 py-2.5">
            <span className="text-sm font-semibold whitespace-nowrap">
              <span className="font-extrabold">{selected.length}</span> selected
            </span>
            <span className="h-5 w-px bg-white/20" />
            <button onClick={() => setSelected([])} className="rounded-full bg-white text-blue-600 hover:bg-blue-50 px-3.5 py-1.5 text-sm font-bold transition-colors">
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
