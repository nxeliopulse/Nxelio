"use client";
import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { Search, Filter, Plus, Trash2, ChevronDown, Users2, Mail, Briefcase, User, ArrowUpDown, Info, Building2, Flame, Sparkles, Target } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useFeedback } from "@/components/ui/feedback";
import { industries, interestAreas } from "@/lib/mock-data";
import { AddLeadsWizard } from "@/components/leads/add-leads-wizard";
import { deleteLead, bulkDeleteLeads, type LeadRow } from "@/lib/queries/leads";

const statusVariant: Record<string, "default" | "blue" | "warning" | "danger" | "success" | "purple"> = {
  New: "blue",
  Warm: "warning",
  Hot: "danger",
  Converted: "success",
  Scored: "purple",
};

interface Props {
  leads: LeadRow[];
  /** Accepted for backwards-compat with the page; the stat strip was removed. */
  stats?: { total: number; hot: number; scored: number; converted: number };
  /** When set, the list is scoped to one campaign's recipients (from "View report"). */
  campaignFilter?: { id: string; name: string };
}

export function LeadsTable({ leads, campaignFilter }: Props) {
  const { confirm } = useFeedback();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<"none" | "name" | "score" | "newest">("none");
  const [tab, setTab] = useState<"leads" | "business">("leads");
  const scrollRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 25;

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
    return matchSearch && matchIndustry;
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

  return (
    <div className="max-w-[1600px] mx-auto">
      {campaignFilter && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
          <p className="text-sm text-blue-900">
            Showing <span className="font-semibold">{leads.length}</span> lead{leads.length === 1 ? "" : "s"} in campaign <span className="font-semibold">{campaignFilter.name}</span>
            <span className="text-blue-700/70"> · click a lead to see its email stages</span>
          </p>
          <Link href="/leads" className="text-sm font-medium text-blue-700 hover:text-blue-900">Clear filter ✕</Link>
        </div>
      )}
      {/* Tab navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 mb-6">
        <div className="flex items-center gap-8">
          <button
            onClick={() => setTab("leads")}
            className={`relative pb-3 text-sm font-semibold transition-colors ${
              tab === "leads" ? "text-blue-600" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Leads
            {tab === "leads" && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-blue-600" />}
          </button>
          <button
            onClick={() => setTab("business")}
            className={`relative pb-3 text-sm font-semibold transition-colors ${
              tab === "business" ? "text-blue-600" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Business Details
            {tab === "business" && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-blue-600" />}
          </button>
        </div>
        <Link href="/settings" className="pb-3 text-sm font-semibold text-slate-500 hover:text-slate-800">
          Settings
        </Link>
      </div>

      {tab === "business" ? (
        <BusinessDetails leads={leads} />
      ) : (
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

          {/* Filters toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            className={showFilters ? "ring-1 ring-blue-200 border-blue-300 text-blue-700" : ""}
          >
            <Filter className="h-4 w-4" /> Filters <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </Button>

          <div className="ml-auto flex items-center gap-2">
            {selected.length > 0 && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                <span className="text-sm text-blue-700 font-medium">{selected.length} selected</span>
                <button onClick={handleBulkDelete} disabled={pending} className="text-red-600 hover:text-red-700 inline-flex items-center gap-1 text-sm disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            )}

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

        {/* Collapsible filter row */}
        {showFilters && (
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-3">
            <Select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)} className="max-w-[200px]">
              <option value="">All industries</option>
              {industries.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </Select>
            <Select className="max-w-[200px]">
              <option>All interest areas</option>
              {interestAreas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
            {(industryFilter || search) && (
              <button
                onClick={() => { setIndustryFilter(""); setSearch(""); }}
                className="text-sm text-slate-500 hover:text-slate-700 underline"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Table with horizontal scroll */}
        <div className="relative">
          <div ref={scrollRef} className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
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
                  <th className="px-4 py-3 font-semibold w-12 text-slate-400">#</th>
                  <th className="px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-slate-400" /> First name</span></th>
                  <th className="px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-slate-400" /> Last name</span></th>
                  <th className="px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-400" /> Email</span></th>
                  <th className="px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" /> Company</span></th>
                  <th className="px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5 text-slate-400" /> Industry</span></th>
                  <th className="px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-400" /> Email provider</span></th>
                  <th className="px-4 py-3 font-semibold">Score</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center text-slate-500">
                      No leads yet. Click <strong>Add Leads</strong> to import from LinkedIn, social, or a CSV.
                    </td>
                  </tr>
                )}
                {paged.map((l, i) => {
                  const { first, last } = splitName(l);
                  const provider = emailProvider(l.email);
                  return (
                    <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.includes(l.id)}
                          onChange={() => toggle(l.id)}
                          className="rounded border-slate-300"
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-400 tabular-nums">{safePage * PAGE_SIZE + i + 1}</td>
                      <td className="px-4 py-3">
                        <Link href={`/leads/${l.id}`} className="font-medium text-slate-900 hover:text-blue-600">{first || "—"}</Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{last || "—"}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-[220px] truncate" title={l.email || ""}>{l.email || "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{l.company_name || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{l.industry || "—"}</td>
                      <td className="px-4 py-3"><EmailProviderCell provider={provider} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${l.lead_score >= 80 ? "bg-red-500" : l.lead_score >= 60 ? "bg-amber-500" : "bg-blue-500"}`}
                              style={{ width: `${l.lead_score}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-slate-700">{l.lead_score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant[l.status] || "default"}>{l.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
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
                  );
                })}
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
      )}

      <AddLeadsWizard open={showWizard} onClose={() => setShowWizard(false)} />
    </div>
  );
}

function BusinessDetails({ leads }: { leads: LeadRow[] }) {
  const total = leads.length;
  const hot = leads.filter((l) => l.status === "Hot").length;
  const scored = leads.filter((l) => (l.lead_score || 0) > 0).length;
  const converted = leads.filter((l) => l.status === "Converted").length;

  function groupBy(getter: (l: LeadRow) => string | null | undefined) {
    const map = new Map<string, number>();
    for (const l of leads) {
      const key = (getter(l) || "Unknown").trim() || "Unknown";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }

  const byStatus = groupBy((l) => l.status);
  const byIndustry = groupBy((l) => l.industry);
  const bySource = groupBy((l) => l.source);
  const max = (rows: [string, number][]) => Math.max(1, ...rows.map((r) => r[1]));

  const cards = [
    { label: "Total leads", value: total, icon: <Users2 className="h-4 w-4" />, color: "text-blue-600 bg-blue-50" },
    { label: "Hot leads", value: hot, icon: <Flame className="h-4 w-4" />, color: "text-amber-600 bg-amber-50" },
    { label: "AI scored", value: scored, icon: <Sparkles className="h-4 w-4" />, color: "text-purple-600 bg-purple-50" },
    { label: "Converted", value: converted, icon: <Target className="h-4 w-4" />, color: "text-emerald-600 bg-emerald-50" },
  ];

  function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
    const m = max(rows);
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">No data yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map(([label, count]) => (
              <li key={label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-slate-600 truncate pr-2">{label}</span>
                  <span className="font-semibold text-slate-900 tabular-nums">{count}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(count / m) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((s) => (
          <Card key={s.label} className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${s.color}`}>{s.icon}</div>
            <div>
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="text-xl font-bold text-slate-900">{s.value.toLocaleString()}</p>
            </div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Breakdown title="Leads by status" rows={byStatus} />
        <Breakdown title="Leads by industry" rows={byIndustry} />
        <Breakdown title="Leads by source" rows={bySource} />
      </div>
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
