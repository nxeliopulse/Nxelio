"use client";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Trash2, ChevronDown, Building2, ArrowUpDown, Settings2, Hash, Phone, Globe, Briefcase, Users2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { EditAccountModal } from "@/components/accounts/edit-account-modal";
import { deleteAccount, bulkDeleteAccounts, type AccountRow } from "@/lib/queries/accounts";

type ColKey = "index" | "account_name" | "industry" | "phone" | "website" | "account_type" | "employees" | "annual_revenue" | "rating";

interface ColumnDef { key: ColKey; label: string; icon?: typeof Building2; defaultOn: boolean }

const COLUMNS: ColumnDef[] = [
  { key: "index", label: "Row #", icon: Hash, defaultOn: true },
  { key: "account_name", label: "Account name", icon: Building2, defaultOn: true },
  { key: "industry", label: "Industry", icon: Briefcase, defaultOn: true },
  { key: "phone", label: "Phone", icon: Phone, defaultOn: true },
  { key: "website", label: "Website", icon: Globe, defaultOn: true },
  { key: "account_type", label: "Type", defaultOn: false },
  { key: "employees", label: "Employees", icon: Users2, defaultOn: false },
  { key: "annual_revenue", label: "Annual revenue", defaultOn: false },
  { key: "rating", label: "Rating", defaultOn: false },
];

const DEFAULT_COLS = COLUMNS.reduce((acc, c) => { acc[c.key] = c.defaultOn; return acc; }, {} as Record<ColKey, boolean>);
const COLS_STORAGE_KEY = "lp_accounts_columns";
const PAGE_SIZE = 15;

export function AccountsTable({ accounts }: { accounts: AccountRow[] }) {
  const { confirm, toast } = useFeedback();
  const router = useRouter();
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

  const filtered = accounts.filter((a) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      a.account_name.toLowerCase().includes(q) ||
      (a.industry?.toLowerCase().includes(q) ?? false) ||
      (a.website?.toLowerCase().includes(q) ?? false) ||
      (a.phone?.toLowerCase().includes(q) ?? false)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "name") return a.account_name.localeCompare(b.account_name);
    if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return 0;
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((a) => a.id));

  function openAccount(id: string) {
    router.push(`/accounts/${id}`);
  }

  async function handleBulkDelete() {
    if (!(await confirm({ title: "Delete accounts?", message: `Delete ${selected.length} account(s)?`, confirmLabel: "Delete", danger: true }))) return;
    const ids = [...selected];
    setSelected([]);
    start(async () => {
      await bulkDeleteAccounts(ids);
      toast(`${ids.length} account(s) deleted.`, "success");
    });
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete account?", message: "Delete this account?", confirmLabel: "Delete", danger: true }))) return;
    start(async () => {
      await deleteAccount(id);
      setSelected((s) => s.filter((x) => x !== id));
    });
  }

  function renderCell(key: ColKey, a: AccountRow, rowNumber: number) {
    switch (key) {
      case "index":
        return <span className="text-slate-400 tabular-nums font-mono text-xs">{rowNumber}</span>;
      case "account_name":
        return (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openAccount(a.id); }}
            className="font-semibold text-slate-900 hover:text-blue-600 truncate max-w-[220px] text-left block whitespace-nowrap"
          >
            {a.account_name}
          </button>
        );
      case "industry":
        return <span className="block max-w-[160px] truncate text-slate-600 font-medium whitespace-nowrap">{a.industry || "—"}</span>;
      case "phone":
        return <span className="text-slate-600 font-mono text-xs whitespace-nowrap">{a.phone || "—"}</span>;
      case "website":
        return a.website
          ? <a href={a.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 max-w-[180px] truncate text-blue-600 hover:underline font-medium text-xs whitespace-nowrap"><Globe className="h-3.5 w-3.5 flex-shrink-0" />{a.website.replace(/^https?:\/\//, "")}</a>
          : <span className="text-slate-400">—</span>;
      case "account_type":
        return <span className="text-slate-600 whitespace-nowrap">{a.account_type || "—"}</span>;
      case "employees":
        return <span className="text-slate-600 tabular-nums whitespace-nowrap">{a.employees ?? "—"}</span>;
      case "annual_revenue":
        return <span className="text-slate-600 tabular-nums whitespace-nowrap">{a.annual_revenue != null ? a.annual_revenue.toLocaleString() : "—"}</span>;
      case "rating":
        return <span className="text-slate-600 whitespace-nowrap">{a.rating || "—"}</span>;
      default:
        return null;
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto w-full">
      <Card className="overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-slate-100 flex items-center justify-between gap-2 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
            <div className="w-36 sm:w-48 md:w-56 flex-shrink-0">
              <Input
                leftIcon={<Search className="h-3.5 w-3.5 text-slate-400" />}
                placeholder="Search accounts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs rounded-xl"
              />
            </div>
            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 flex-shrink-0">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span>{filtered.length}</span>
            </div>
            <Button variant="outline" size="sm" onClick={openColsMenu} className="rounded-xl gap-1 font-medium h-8 text-xs px-2.5 text-slate-700 flex-shrink-0" title="Customize visible columns">
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
                className="appearance-none rounded-xl border border-slate-200 bg-white pl-6 pr-6 py-1 h-8 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm cursor-pointer"
              >
                <option value="none">Sort</option>
                <option value="name">Name A–Z</option>
                <option value="newest">Newest</option>
              </select>
              <ChevronDown className="h-3 w-3 text-slate-400 absolute right-2 pointer-events-none" />
            </div>
            <Button size="sm" onClick={() => setShowModal(true)} className="rounded-xl gap-1.5 font-bold h-8 px-3 text-xs flex-shrink-0 whitespace-nowrap">
              <Plus className="h-3.5 w-3.5" />
              <span>Add Account</span>
            </Button>
          </div>
        </div>

        <div className="relative">
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-260px)] scrollbar-hide">
            <table className="w-full text-sm border-collapse min-w-[900px]">
              <thead className="bg-slate-50/90 border-b border-slate-200/80 sticky top-0 z-10 backdrop-blur-md">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3.5 w-10">
                    <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded border-slate-300" />
                  </th>
                  {visibleCols.map((c) => (
                    <th key={c.key} className={cn("px-4 py-3.5 font-bold whitespace-nowrap", c.key === "index" && "w-12")}>
                      <span className="inline-flex items-center gap-1.5">
                        {c.icon && <c.icon className="h-3.5 w-3.5 text-slate-400" />}
                        {c.label === "Row #" ? "#" : c.label}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3.5 w-12 text-right font-bold text-slate-400"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={visibleCols.length + 2} className="px-4 py-16 text-center text-slate-500">
                      No accounts yet. Click <strong>Add Account</strong> to create one.
                    </td>
                  </tr>
                )}
                {paged.map((a, i) => (
                  <tr key={a.id} onClick={() => openAccount(a.id)} className="hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} className="rounded border-slate-300" />
                    </td>
                    {visibleCols.map((c) => (
                      <td key={c.key} className="px-4 py-3">{renderCell(c.key, a, safePage * PAGE_SIZE + i + 1)}</td>
                    ))}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleDelete(a.id)} disabled={pending} title="Delete account" className="p-1 rounded-md hover:bg-red-50 disabled:opacity-50">
                        <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
          <span>
            {filtered.length === 0 ? "Showing 0 of 0" : `Showing ${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Page {safePage + 1} of {pageCount}</span>
            <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
              Next <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
            </Button>
          </div>
        </div>
      </Card>

      <EditAccountModal open={showModal} onClose={() => setShowModal(false)} />

      {showCols && colsPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowCols(false)} />
          <div className="fixed z-50 w-60 rounded-xl border border-slate-200 bg-white shadow-xl p-2" style={{ top: colsPos.top, right: colsPos.right }}>
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Show columns</p>
            <div className="max-h-80 overflow-y-auto">
              {COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
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
