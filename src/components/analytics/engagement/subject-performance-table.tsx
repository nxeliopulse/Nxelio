"use client";
import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { formatNumber } from "@/components/analytics/overview/kpi-card";
import type { SubjectRow } from "@/lib/queries/analytics-engagement";

type SortKey = keyof Pick<SubjectRow, "sent" | "openRate" | "replyRate" | "positiveReplyRate" | "meetingsGenerated">;

/** Subject Line Performance (doc §9) — one row per campaign's fixed subject
 *  line, since this schema tracks one subject per campaign rather than
 *  per-message subject variants. Server pre-sorts by reply rate; column
 *  headers re-sort the already-fetched rows client-side. */
export function SubjectPerformanceTable({ rows }: { rows: SubjectRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("replyRate");
  const [sortDesc, setSortDesc] = useState(true);
  const sorted = [...rows].sort((a, b) => (sortDesc ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]));

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDesc(!sortDesc);
    else { setSortKey(key); setSortDesc(true); }
  }

  function SortableTh({ label, sortKeyVal }: { label: string; sortKeyVal: SortKey }) {
    return (
      <DataTableTh className="text-right">
        <button onClick={() => toggleSort(sortKeyVal)} className="inline-flex items-center gap-1 hover:text-slate-900">
          {label} <ArrowUpDown className="h-3 w-3" />
        </button>
      </DataTableTh>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Subject Line Performance</CardTitle></CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>Subject</DataTableTh>
            <SortableTh label="Sent" sortKeyVal="sent" />
            <SortableTh label="Open Rate" sortKeyVal="openRate" />
            <SortableTh label="Reply Rate" sortKeyVal="replyRate" />
            <SortableTh label="Positive Reply Rate" sortKeyVal="positiveReplyRate" />
            <SortableTh label="Meetings Generated" sortKeyVal="meetingsGenerated" />
          </tr>
        </DataTableHead>
        <DataTableBody>
          {sorted.length === 0 && <DataTableEmpty colSpan={6}>No sends in the selected period.</DataTableEmpty>}
          {sorted.map((r, i) => (
            <DataTableRow key={i}>
              <DataTableTd className="font-medium max-w-xs truncate">{r.subject}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.sent)}</DataTableTd>
              <DataTableTd className="text-right">{r.openRate}%</DataTableTd>
              <DataTableTd className="text-right">{r.replyRate}%</DataTableTd>
              <DataTableTd className="text-right">{r.positiveReplyRate}%</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.meetingsGenerated)}</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
