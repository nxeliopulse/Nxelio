"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpDown } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import type { TopProspectRow } from "@/lib/queries/analytics-prospects";

const ENGAGEMENT_STYLE: Record<string, string> = {
  High: "text-emerald-600 bg-emerald-50",
  Medium: "text-amber-600 bg-amber-50",
  Low: "text-slate-500 bg-slate-50",
};

const ENGAGEMENT_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
type SortKey = "aiScore" | "buyingIntent" | "engagement" | "lastActivity";

/** Top Prospects table (doc §10) — server sorts by AI Score desc by default;
 *  the sortable-column requirement (spec) is a client-side re-sort of the
 *  same already-fetched rows, no refetch needed. */
export function TopProspectsTable({ prospects, ownerNames }: { prospects: TopProspectRow[]; ownerNames: Record<string, string> }) {
  const [sortKey, setSortKey] = useState<SortKey>("aiScore");
  const [sortDesc, setSortDesc] = useState(true);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDesc(!sortDesc);
    else { setSortKey(key); setSortDesc(true); }
  }

  const sorted = [...prospects].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "aiScore") cmp = a.aiScore - b.aiScore;
    else if (sortKey === "engagement") cmp = (ENGAGEMENT_RANK[a.engagement] || 0) - (ENGAGEMENT_RANK[b.engagement] || 0);
    else if (sortKey === "buyingIntent") cmp = a.buyingIntent.localeCompare(b.buyingIntent);
    else if (sortKey === "lastActivity") cmp = (a.lastActivity ?? "").localeCompare(b.lastActivity ?? "");
    return sortDesc ? -cmp : cmp;
  });

  function SortableTh({ label, sortKeyVal }: { label: string; sortKeyVal: SortKey }) {
    return (
      <DataTableTh>
        <button onClick={() => toggleSort(sortKeyVal)} className="inline-flex items-center gap-1 hover:text-slate-900">
          {label} <ArrowUpDown className="h-3 w-3" />
        </button>
      </DataTableTh>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-0 border-0">
        <CardTitle className="text-sm">Top Prospects</CardTitle>
      </CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>Prospect</DataTableTh>
            <DataTableTh>Company</DataTableTh>
            <DataTableTh>Title</DataTableTh>
            <DataTableTh>Source</DataTableTh>
            <SortableTh label="AI Score" sortKeyVal="aiScore" />
            <SortableTh label="Buying Intent" sortKeyVal="buyingIntent" />
            <SortableTh label="Engagement" sortKeyVal="engagement" />
            <SortableTh label="Last Activity" sortKeyVal="lastActivity" />
            <DataTableTh>Owner</DataTableTh>
            <DataTableTh>Status</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {sorted.length === 0 && <DataTableEmpty colSpan={10}>No prospects match the selected filters.</DataTableEmpty>}
          {sorted.map((p) => (
            <DataTableRow key={p.id}>
              <DataTableTd className="font-semibold text-slate-900">
                <Link href={`/leads/${p.id}`} className="hover:underline">{p.name}</Link>
              </DataTableTd>
              <DataTableTd>{p.company || "—"}</DataTableTd>
              <DataTableTd>{p.title || "—"}</DataTableTd>
              <DataTableTd>{p.source || "—"}</DataTableTd>
              <DataTableTd className="text-right font-bold">{p.aiScore}</DataTableTd>
              <DataTableTd>{p.buyingIntent}</DataTableTd>
              <DataTableTd>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ENGAGEMENT_STYLE[p.engagement]}`}>{p.engagement}</span>
              </DataTableTd>
              <DataTableTd>{p.lastActivity ? new Date(p.lastActivity).toLocaleDateString() : "—"}</DataTableTd>
              <DataTableTd>{p.ownerId ? ownerNames[p.ownerId] || "—" : "—"}</DataTableTd>
              <DataTableTd>{p.status}</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
