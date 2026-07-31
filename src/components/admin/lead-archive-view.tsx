"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import type { LeadArchiveRow } from "@/lib/queries/lead-import-archive";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Quotes a CSV field only when it needs it (contains a comma, quote, or newline). */
function csvField(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const CSV_HEADERS = ["Name", "Email", "Company", "Workspace", "Imported by", "Source", "Imported", "Status"];

function exportCsv(rows: (LeadArchiveRow & { workspace_name: string | null })[]) {
  const lines = [
    CSV_HEADERS.join(","),
    ...rows.map((r) =>
      [
        r.full_name || "",
        r.email || "",
        r.company_name || "",
        r.workspace_name || "",
        r.imported_by_name || "",
        r.source || "",
        formatDate(r.imported_at),
        r.deleted_from_leads_at ? "Deleted from Leads" : "Active",
      ].map(csvField).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads-archive-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 15;

export function AdminLeadArchiveView({ rows }: { rows: (LeadArchiveRow & { workspace_name: string | null })[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        [r.full_name, r.email, r.company_name, r.workspace_name, r.imported_by_name]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      )
    : rows;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div>
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, company, workspace…"
          className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-[#18A7B8] focus:ring-2 focus:ring-[#18A7B8]/20 shadow-sm transition-all"
        />
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {filtered.length} of {rows.length} rows
          </span>
          <button
            onClick={() => exportCsv(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-[#18A7B8] hover:bg-[#14929f] text-white px-4 py-2.5 text-sm font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="max-h-[calc(100vh-320px)] overflow-y-auto scrollbar-hide">
          <DataTable className="min-w-[900px]">
            <DataTableHead className="sticky top-0 z-10">
              <tr className="text-left">
                <DataTableTh>Name</DataTableTh>
                <DataTableTh>Email</DataTableTh>
                <DataTableTh>Company</DataTableTh>
                <DataTableTh>Workspace</DataTableTh>
                <DataTableTh>Imported by</DataTableTh>
                <DataTableTh>Source</DataTableTh>
                <DataTableTh>Imported</DataTableTh>
                <DataTableTh>Status</DataTableTh>
              </tr>
            </DataTableHead>
            <DataTableBody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {paged.length === 0 && (
                <DataTableEmpty colSpan={8}>No archived leads yet.</DataTableEmpty>
              )}
              {paged.map((r) => (
                <DataTableRow key={r.id}>
                  <DataTableTd className="font-semibold text-slate-900 dark:text-white">{r.full_name || "—"}</DataTableTd>
                  <DataTableTd className="text-slate-600 dark:text-slate-300 font-medium">{r.email || "—"}</DataTableTd>
                  <DataTableTd className="text-slate-600 dark:text-slate-300 font-medium">{r.company_name || "—"}</DataTableTd>
                  <DataTableTd className="text-slate-500 dark:text-slate-400">{r.workspace_name || "—"}</DataTableTd>
                  <DataTableTd className="text-slate-500 dark:text-slate-400">{r.imported_by_name || "—"}</DataTableTd>
                  <DataTableTd className="text-slate-500 dark:text-slate-400">{r.source || "—"}</DataTableTd>
                  <DataTableTd className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(r.imported_at)}</DataTableTd>
                  <DataTableTd>
                    {r.deleted_from_leads_at ? (
                      <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 text-xs font-semibold">
                        Deleted from Leads
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 text-xs font-semibold">
                        Active
                      </span>
                    )}
                  </DataTableTd>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        </div>
        <Pagination page={safePage + 1} totalPages={pageCount} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={(p) => setPage(p - 1)} />
      </Card>
    </div>
  );
}
