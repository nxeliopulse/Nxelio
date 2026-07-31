"use client";
import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, Plus, Trash2, ChevronDown, Users2, Mail, ArrowUpDown, Settings2, Hash, Phone, Briefcase, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { EditContactModal } from "@/components/contacts/edit-contact-modal";
import { deleteContact, bulkDeleteContacts, type ContactRow } from "@/lib/queries/contacts";

type ColKey = "index" | "first_name" | "last_name" | "email" | "phone" | "job_title" | "department" | "lead_source";

interface ColumnDef { key: ColKey; label: string; icon?: typeof Users2; defaultOn: boolean }

const COLUMNS: ColumnDef[] = [
  { key: "index", label: "Row #", icon: Hash, defaultOn: true },
  { key: "first_name", label: "First name", icon: User, defaultOn: true },
  { key: "last_name", label: "Last name", icon: User, defaultOn: true },
  { key: "email", label: "Email", icon: Mail, defaultOn: true },
  { key: "phone", label: "Phone", icon: Phone, defaultOn: true },
  { key: "job_title", label: "Job title", icon: Briefcase, defaultOn: true },
  { key: "department", label: "Department", defaultOn: false },
  { key: "lead_source", label: "Lead source", defaultOn: false },
];

const DEFAULT_COLS = COLUMNS.reduce((acc, c) => { acc[c.key] = c.defaultOn; return acc; }, {} as Record<ColKey, boolean>);
const COLS_STORAGE_KEY = "lp_contacts_columns";
const PAGE_SIZE = 15;

export function ContactsTable({ contacts }: { contacts: ContactRow[] }) {
  const { confirm, toast } = useFeedback();
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountFilterId = searchParams.get("account");
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"none" | "name" | "newest">("none");
  const [page, setPage] = useState(0);
  const [showModal, setShowModal] = useState(false);

  const [cols, setCols] = useState<Record<ColKey, boolean>>(DEFAULT_COLS);
  const [showCols, setShowCols] = useState(false);
  const [colsPos, setColsPos] = useState<{ top: number; right: number } | null>(null);

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
  function openColsMenu(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setColsPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    setShowCols(true);
  }

  const visibleCols = COLUMNS.filter((c) => cols[c.key]);

  const scoped = accountFilterId ? contacts.filter((c) => c.account_id === accountFilterId) : contacts;

  const filtered = scoped.filter((c) => {
    const q = search.toLowerCase();
    if (!q) return true;
    const name = `${c.first_name} ${c.last_name}`.toLowerCase();
    return (
      name.includes(q) ||
      (c.email?.toLowerCase().includes(q) ?? false) ||
      (c.job_title?.toLowerCase().includes(q) ?? false) ||
      (c.phone?.toLowerCase().includes(q) ?? false)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "name") return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return 0;
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((c) => c.id));

  function openContact(id: string) {
    router.push(`/contacts/${id}`);
  }

  async function handleBulkDelete() {
    if (!(await confirm({ title: "Delete contacts?", message: `Delete ${selected.length} contact(s)?`, confirmLabel: "Delete", danger: true }))) return;
    const ids = [...selected];
    setSelected([]);
    start(async () => {
      await bulkDeleteContacts(ids);
      toast(`${ids.length} contact(s) deleted.`, "success");
    });
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete contact?", message: "Delete this contact?", confirmLabel: "Delete", danger: true }))) return;
    start(async () => {
      await deleteContact(id);
      setSelected((s) => s.filter((x) => x !== id));
    });
  }

  const AVATAR_COLORS = ["bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-violet-600", "bg-cyan-600", "bg-pink-600", "bg-indigo-600"];

  function initials(c: ContactRow): string {
    const first = c.first_name?.[0] || "";
    const last = c.last_name?.[0] || "";
    return (first + last).toUpperCase() || "?";
  }

  function avatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  function renderCell(key: ColKey, c: ContactRow, rowNumber: number) {
    switch (key) {
      case "index":
        return <span className="text-slate-400 tabular-nums font-mono text-xs">{rowNumber}</span>;
      case "first_name":
        return (
          <button type="button" onClick={(e) => { e.stopPropagation(); openContact(c.id); }} className="flex items-center gap-2 max-w-[180px] text-left group">
            <span className={cn("h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0", avatarColor(`${c.first_name} ${c.last_name}`))}>
              {initials(c)}
            </span>
            <span className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate whitespace-nowrap">
              {c.first_name || "—"}
            </span>
          </button>
        );
      case "last_name":
        return <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[160px] block whitespace-nowrap">{c.last_name || "—"}</span>;
      case "email":
        return <span className="block max-w-[240px] truncate text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">{c.email || "—"}</span>;
      case "phone":
        return <span className="text-slate-600 dark:text-slate-400 font-mono text-xs whitespace-nowrap">{c.phone || "—"}</span>;
      case "job_title":
        return <span className="block max-w-[180px] truncate text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">{c.job_title || "—"}</span>;
      case "department":
        return <span className="text-slate-600 dark:text-slate-400 whitespace-nowrap">{c.department || "—"}</span>;
      case "lead_source":
        return <span className="text-slate-600 dark:text-slate-400 whitespace-nowrap">{c.lead_source || "—"}</span>;
      default:
        return null;
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="h-11 w-11 rounded-2xl bg-[var(--primary)] flex items-center justify-center shadow-md shadow-black/10 flex-shrink-0">
            <Users2 className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Contacts</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">People you&apos;re building relationships with across your accounts.</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowModal(true)} className="rounded-xl gap-1.5 font-bold h-10 px-4 flex-shrink-0 whitespace-nowrap self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          <span>Add Contact</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 border-l-4 border-l-blue-500 p-4 sm:p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Contacts</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5">{scoped.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 border-l-4 border-l-emerald-500 p-4 sm:p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Linked to Account</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5">{scoped.filter((c) => c.account_id).length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 border-l-4 border-l-amber-500 p-4 sm:p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Unassigned</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5">{scoped.filter((c) => !c.account_id).length}</p>
        </div>
      </div>

      {accountFilterId && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-2.5">
          <p className="text-sm text-blue-900 dark:text-blue-200">
            Showing <span className="font-semibold">{scoped.length}</span> contact{scoped.length === 1 ? "" : "s"} for this account
          </p>
          <Link href="/contacts" className="text-sm font-medium text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100">Clear filter ✕</Link>
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
            <div className="w-36 sm:w-48 md:w-56 flex-shrink-0">
              <Input
                leftIcon={<Search className="h-3.5 w-3.5 text-slate-400" />}
                placeholder="Search contacts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs rounded-xl"
              />
            </div>
            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 flex-shrink-0">
              <Users2 className="h-3.5 w-3.5 text-slate-400" />
              <span>{filtered.length}</span>
            </div>
            <Button variant="outline" size="sm" onClick={openColsMenu} className="rounded-xl gap-1 font-medium h-8 text-xs px-2.5 flex-shrink-0" title="Customize visible columns">
              <Settings2 className="h-3.5 w-3.5 text-slate-400" />
              <span>Columns</span>
            </Button>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            {selected.length > 0 && (
              <Button variant="danger" size="sm" onClick={handleBulkDelete} className="rounded-xl gap-1 font-semibold h-8 px-2.5 text-xs flex-shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Delete</span> ({selected.length})
              </Button>
            )}
            <div className="relative inline-flex items-center flex-shrink-0">
              <ArrowUpDown className="h-3 w-3 text-slate-400 absolute left-2 pointer-events-none" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="appearance-none rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-6 pr-6 py-1 h-8 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm cursor-pointer"
              >
                <option value="none">Sort</option>
                <option value="name">Name A–Z</option>
                <option value="newest">Newest</option>
              </select>
              <ChevronDown className="h-3 w-3 text-slate-400 absolute right-2 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="overflow-y-auto max-h-[calc(100vh-260px)] scrollbar-hide">
            <DataTable className="min-w-[900px]">
              <DataTableHead className="sticky top-0 z-10 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <DataTableTh className="w-10">
                    <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded border-slate-300" />
                  </DataTableTh>
                  {visibleCols.map((c) => (
                    <DataTableTh key={c.key} className={cn(c.key === "index" && "w-12")}>
                      <span className="inline-flex items-center gap-1.5">
                        {c.icon && <c.icon className="h-3.5 w-3.5 text-slate-400" />}
                        {c.label === "Row #" ? "#" : c.label}
                      </span>
                    </DataTableTh>
                  ))}
                  <DataTableTh className="w-12 text-right"></DataTableTh>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {paged.length === 0 && (
                  <DataTableEmpty colSpan={visibleCols.length + 2}>
                    No contacts yet. Click <strong>Add Contact</strong> to create one.
                  </DataTableEmpty>
                )}
                {paged.map((c, i) => (
                  <DataTableRow key={c.id} onClick={() => openContact(c.id)} className="cursor-pointer">
                    <DataTableTd onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} className="rounded border-slate-300" />
                    </DataTableTd>
                    {visibleCols.map((col) => (
                      <DataTableTd key={col.key}>{renderCell(col.key, c, safePage * PAGE_SIZE + i + 1)}</DataTableTd>
                    ))}
                    <DataTableTd onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleDelete(c.id)} disabled={pending} title="Delete contact" className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-rose-950/50 disabled:opacity-50">
                        <Trash2 className="h-4 w-4 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-rose-400" />
                      </button>
                    </DataTableTd>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </div>
        </div>

        <Pagination page={safePage + 1} totalPages={pageCount} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={(p) => setPage(p - 1)} />
      </Card>

      <EditContactModal open={showModal} onClose={() => setShowModal(false)} defaultAccountId={accountFilterId || undefined} />

      {showCols && colsPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowCols(false)} />
          <div className="fixed z-50 w-60 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-2" style={{ top: colsPos.top, right: colsPos.right }}>
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Show columns</p>
            <div className="max-h-80 overflow-y-auto">
              {COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={cols[c.key]} onChange={() => toggleCol(c.key)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className="inline-flex items-center gap-1.5">
                    {c.icon && <c.icon className="h-3.5 w-3.5 text-slate-400" />}
                    {c.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {selected.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 lp-anim-pop max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-3 rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/30 pl-5 pr-3 py-2.5">
            <span className="text-sm font-medium whitespace-nowrap">
              <span className="font-semibold">{selected.length}</span> selected
            </span>
            <span className="h-5 w-px bg-white/20" />
            <button onClick={handleBulkDelete} disabled={pending} className="inline-flex items-center gap-1.5 rounded-full bg-white text-red-600 hover:bg-red-50 disabled:opacity-50 px-3.5 py-1.5 text-sm font-medium transition-colors">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <button onClick={() => setSelected([])} className="rounded-full bg-white text-blue-600 hover:bg-blue-50 px-3.5 py-1.5 text-sm font-medium transition-colors">
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
