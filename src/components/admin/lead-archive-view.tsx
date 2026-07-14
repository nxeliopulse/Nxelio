"use client";
import { useState } from "react";
import type { LeadArchiveRow } from "@/lib/queries/lead-import-archive";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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
      <div className="mb-4 flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, company, workspace…"
          className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
        />
        <span className="text-xs text-slate-500">{filtered.length} of {rows.length} rows</span>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto scrollbar-hide">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-900 sticky top-0 z-10">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Company</th>
                <th className="px-4 py-3 font-semibold">Workspace</th>
                <th className="px-4 py-3 font-semibold">Imported by</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Imported</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">No archived leads yet.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-900/50">
                  <td className="px-4 py-3 text-white">{r.full_name || "—"}</td>
                  <td className="px-4 py-3 text-slate-300">{r.email || "—"}</td>
                  <td className="px-4 py-3 text-slate-300">{r.company_name || "—"}</td>
                  <td className="px-4 py-3 text-slate-400">{r.workspace_name || "—"}</td>
                  <td className="px-4 py-3 text-slate-400">{r.imported_by_name || "—"}</td>
                  <td className="px-4 py-3 text-slate-400">{r.source || "—"}</td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatDate(r.imported_at)}</td>
                  <td className="px-4 py-3">
                    {r.deleted_from_leads_at ? (
                      <span className="inline-flex items-center rounded-full bg-red-950 px-2 py-0.5 text-xs text-red-300">Deleted from Leads</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-950 px-2 py-0.5 text-xs text-emerald-300">Active</span>
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
