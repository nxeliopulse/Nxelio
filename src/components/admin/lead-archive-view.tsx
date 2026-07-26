"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import type { LeadArchiveRow } from "@/lib/queries/lead-import-archive";

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

export function AdminLeadArchiveView({ rows }: { rows: (LeadArchiveRow & { workspace_name: string | null })[] }) {
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        [r.full_name, r.email, r.company_name, r.workspace_name, r.imported_by_name]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      )
    : rows;

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

      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto scrollbar-hide">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50/80 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200/80 dark:border-slate-800">
              <tr className="text-left">
                <th className="px-5 py-3.5 font-bold">Name</th>
                <th className="px-5 py-3.5 font-bold">Email</th>
                <th className="px-5 py-3.5 font-bold">Company</th>
                <th className="px-5 py-3.5 font-bold">Workspace</th>
                <th className="px-5 py-3.5 font-bold">Imported by</th>
                <th className="px-5 py-3.5 font-bold">Source</th>
                <th className="px-5 py-3.5 font-bold">Imported</th>
                <th className="px-5 py-3.5 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400 dark:text-slate-500 font-medium">
                    No archived leads yet.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">{r.full_name || "—"}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 font-medium">{r.email || "—"}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 font-medium">{r.company_name || "—"}</td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{r.workspace_name || "—"}</td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{r.imported_by_name || "—"}</td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{r.source || "—"}</td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(r.imported_at)}</td>
                  <td className="px-5 py-3.5">
                    {r.deleted_from_leads_at ? (
                      <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 text-xs font-semibold">
                        Deleted from Leads
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 text-xs font-semibold">
                        Active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
