"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Mail, MoreHorizontal, Send, Eye, Copy, Trash2,
  TrendingUp, MousePointer, Calendar, CheckCircle2, Clock, Sparkles, Filter, RefreshCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { useFeedback } from "@/components/ui/feedback";
import { deleteNewsletter, duplicateNewsletter, type NewsletterRow } from "@/lib/queries/newsletters";
import { formatDate, cn } from "@/lib/utils";
import { NewsletterTemplateGallery } from "@/components/newsletters/newsletter-template-gallery";
import type { NewsletterTemplateCategory } from "@/lib/newsletter-templates";

const statusVariant: Record<string, "default" | "blue" | "warning" | "success" | "danger"> = {
  Draft: "default",
  Scheduled: "warning",
  Sending: "blue",
  Sent: "success",
  Failed: "danger",
};

interface Props {
  newsletters: NewsletterRow[];
  stats: { total: number; sent: number; avgOpenRate: number; avgClickRate: number };
}

export function NewslettersView({ newsletters, stats }: Props) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [templateCatFilter, setTemplateCatFilter] = useState<"All" | NewsletterTemplateCategory>("All");
  const [pending, start] = useTransition();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  const filtered = newsletters.filter((n) => {
    const matchesSearch = !search || n.title.toLowerCase().includes(search.toLowerCase()) || (n.subject || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || n.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete newsletter?", message: "Are you sure you want to delete this newsletter?", confirmLabel: "Delete", danger: true }))) return;
    start(async () => { await deleteNewsletter(id); });
    setMenuOpen(null);
  }

  function handleDuplicate(id: string) {
    start(async () => { await duplicateNewsletter(id); });
    setMenuOpen(null);
  }

  if (newsletters.length === 0) {
    return (
      <div className="max-w-[1600px] mx-auto">
        <NewsletterTemplateGallery
          catFilter={templateCatFilter}
          onCatFilterChange={setTemplateCatFilter}
          onPick={(templateId) => router.push(`/newsletters/builder?template=${templateId}`)}
          onBlank={() => router.push("/newsletters/builder")}
        />
      </div>
    );
  }

  const newsletterStatCards = [
    { label: "Total Newsletters", value: stats.total, icon: Mail, accent: "bg-cyan-500", filterValue: "All" as const },
    { label: "Sent Campaigns", value: stats.sent, icon: Send, accent: "bg-emerald-500", filterValue: "Sent" as const },
    { label: "Avg. Open Rate", value: `${stats.avgOpenRate}%`, icon: Eye, accent: "bg-indigo-500", filterValue: null },
    { label: "Avg. Click Rate", value: `${stats.avgClickRate}%`, icon: MousePointer, accent: "bg-amber-500", filterValue: null },
  ];

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Page header — title + breadcrumb + actions, matching the Prospects screen */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Newsletters
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
            <Link href="/dashboard" className="hover:text-slate-700 dark:hover:text-slate-600">Home</Link>
            <span className="mx-1">›</span>
            <span className="text-slate-700 dark:text-slate-600 font-medium">Newsletters</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              toast("Refreshing newsletters...", "info");
              router.refresh();
              setTimeout(() => window.location.reload(), 100);
            }}
            className="rounded-xl h-8 w-8"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Link href="/newsletters/builder">
            <Button size="sm" className="rounded-xl gap-1.5 font-semibold h-8 text-xs px-3">
              <Plus className="h-3.5 w-3.5" /> New Newsletter
            </Button>
          </Link>
        </div>
      </div>

      {/* Stat cards — clickable colored KPI grid, same pattern as Prospects */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {newsletterStatCards.map((s) => {
          const Icon = s.icon;
          const isActive = s.filterValue !== null && statusFilter === s.filterValue;
          return (
            <Card
              key={s.label}
              onClick={
                s.filterValue === null
                  ? undefined
                  : () => {
                      const next = statusFilter === s.filterValue ? "All" : s.filterValue;
                      setStatusFilter(next);
                      toast(next === "All" ? "Showing all newsletters" : `Filtering by "${s.label}"`, "info");
                    }
              }
              className={cn(
                "p-4 sm:p-5 flex items-center gap-3 transition-shadow",
                s.filterValue !== null && "cursor-pointer hover:shadow-md",
                isActive && "ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-950 ring-blue-500"
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

      {/* Main Table Card */}
      <Card className="overflow-hidden">
        {/* Toolbar with Search and Status Filter Pills */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1 max-w-md">
              <Input
                leftIcon={<Search className="h-4 w-4 text-slate-400" />}
                placeholder="Search newsletters by title or subject..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-xl border-slate-200 dark:border-slate-800"
              />
            </div>

            {/* Count Chip */}
            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[var(--muted)] px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-600 flex-shrink-0 whitespace-nowrap">
              <Mail className="h-3.5 w-3.5 text-slate-400" />
              <span>{filtered.length} Newsletter{filtered.length === 1 ? "" : "s"}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 p-1 bg-slate-50 dark:bg-slate-950/60">
            {["All", "Draft", "Scheduled", "Sent"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  statusFilter === st
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-16 text-center text-slate-400 dark:text-slate-500">
            <h3 className="font-bold text-slate-900 dark:text-white mb-1 text-base">No newsletters found</h3>
            <p className="text-xs">No newsletters match your current filter criteria.</p>
          </div>
        ) : (
          <>
          <DataTable>
              <DataTableHead>
                <tr>
                  <DataTableTh>Title & Subject</DataTableTh>
                  <DataTableTh>Status</DataTableTh>
                  <DataTableTh>Recipients</DataTableTh>
                  <DataTableTh>Open Rate</DataTableTh>
                  <DataTableTh>Click Rate</DataTableTh>
                  <DataTableTh>Sent Date</DataTableTh>
                  <DataTableTh className="w-12 text-right">Actions</DataTableTh>
                </tr>
              </DataTableHead>
              <DataTableBody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {paged.map((n) => {
                  const openRate = n.sent_count > 0 ? Math.round((n.open_count / n.sent_count) * 1000) / 10 : 0;
                  const clickRate = n.sent_count > 0 ? Math.round((n.click_count / n.sent_count) * 1000) / 10 : 0;
                  return (
                    <DataTableRow key={n.id}>
                      <DataTableTd>
                        <Link href={`/newsletters/builder?id=${n.id}`} className="block group">
                          <p className="font-bold text-slate-900 dark:text-white group-hover:text-[var(--primary)] transition-colors text-sm">
                            {n.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5 line-clamp-1">
                            {n.subject || "(No subject line)"}
                          </p>
                        </Link>
                      </DataTableTd>
                      <DataTableTd>
                        <Badge variant={statusVariant[n.status] || "default"}>{n.status}</Badge>
                      </DataTableTd>
                      <DataTableTd className="text-slate-900 dark:text-slate-700 font-bold">
                        {n.recipient_count.toLocaleString()}
                      </DataTableTd>
                      <DataTableTd>
                        {n.sent_count > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, openRate)}%` }} />
                            </div>
                            <span className="text-slate-900 dark:text-slate-700 font-bold text-xs">{openRate}%</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </DataTableTd>
                      <DataTableTd>
                        {n.sent_count > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400 font-bold text-xs">{clickRate}%</span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </DataTableTd>
                      <DataTableTd className="text-slate-500 dark:text-slate-500 text-xs">
                        {n.sent_at ? formatDate(n.sent_at) : "—"}
                      </DataTableTd>
                      <DataTableTd className="text-right relative">
                        <button
                          onClick={(e) => {
                            if (menuOpen === n.id) { setMenuOpen(null); return; }
                            const r = e.currentTarget.getBoundingClientRect();
                            setMenuPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
                            setMenuOpen(n.id);
                          }}
                          className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {menuOpen === n.id && menuPos && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
                            <div
                              className="fixed z-50 w-44 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden py-1 text-xs font-semibold"
                              style={{ top: menuPos.top, right: menuPos.right }}
                            >
                              <Link
                                href={`/newsletters/builder?id=${n.id}`}
                                className="flex items-center gap-2 px-3.5 py-2 text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-[var(--muted)]"
                                onClick={() => setMenuOpen(null)}
                              >
                                <Eye className="h-3.5 w-3.5 text-[var(--primary)]" /> Edit / View
                              </Link>
                              <button
                                onClick={() => handleDuplicate(n.id)}
                                disabled={pending}
                                className="w-full flex items-center gap-2 px-3.5 py-2 text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-[var(--muted)] text-left"
                              >
                                <Copy className="h-3.5 w-3.5 text-indigo-500" /> Duplicate
                              </button>
                              {n.status === "Draft" && (
                                <Link
                                  href={`/newsletters/builder?id=${n.id}&send=1`}
                                  className="flex items-center gap-2 px-3.5 py-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                  onClick={() => setMenuOpen(null)}
                                >
                                  <Send className="h-3.5 w-3.5" /> Send now
                                </Link>
                              )}
                              <button
                                onClick={() => handleDelete(n.id)}
                                disabled={pending}
                                className="w-full flex items-center gap-2 px-3.5 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-left"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </div>
                          </>
                        )}
                      </DataTableTd>
                    </DataTableRow>
                  );
                })}
              </DataTableBody>
            </DataTable>
            <Pagination page={safePage + 1} totalPages={pageCount} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={(p) => setPage(p - 1)} />
          </>
        )}
      </Card>
    </div>
  );
}
