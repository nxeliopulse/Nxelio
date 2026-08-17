"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpDown } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/components/analytics/overview/kpi-card";
import type { SegmentPerformanceRow } from "@/lib/queries/analytics-segments";

const STATUS_STYLE: Record<string, string> = {
  Active: "text-emerald-600 bg-emerald-50",
  Archived: "text-slate-500 bg-slate-100",
};

type SortKey = keyof Pick<SegmentPerformanceRow, "replyRate" | "meetingRate" | "qualificationRate" | "opportunities" | "pipeline" | "revenue">;

/** Segment Performance Table (doc §8) — user-selectable sort across all
 *  segments serves as this phase's "compare 2-5 audiences" — a dedicated
 *  multi-select comparison widget is deferred to a later pass. */
export function SegmentPerformanceTable({ rows }: { rows: SegmentPerformanceRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
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
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">Segment Performance</CardTitle></CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>Segment</DataTableTh>
            <DataTableTh>Type</DataTableTh>
            <DataTableTh>Status</DataTableTh>
            <DataTableTh className="text-right">Matching</DataTableTh>
            <DataTableTh className="text-right">Eligible</DataTableTh>
            <DataTableTh className="text-right">Campaigns</DataTableTh>
            <SortableTh label="Reply Rate" sortKeyVal="replyRate" />
            <SortableTh label="Meeting Rate" sortKeyVal="meetingRate" />
            <SortableTh label="Qualification Rate" sortKeyVal="qualificationRate" />
            <SortableTh label="Opportunities" sortKeyVal="opportunities" />
            <SortableTh label="Pipeline" sortKeyVal="pipeline" />
            <SortableTh label="Revenue" sortKeyVal="revenue" />
          </tr>
        </DataTableHead>
        <DataTableBody>
          {sorted.length === 0 && <DataTableEmpty colSpan={12}>No segments exist yet.</DataTableEmpty>}
          {sorted.map((r) => (
            <DataTableRow key={r.id}>
              <DataTableTd className="font-semibold text-slate-900">
                <Link href="/segments" className="hover:underline">{r.name}</Link>
              </DataTableTd>
              <DataTableTd>{r.type}</DataTableTd>
              <DataTableTd><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[r.status] ?? "text-slate-500 bg-slate-50"}`}>{r.status}</span></DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.matchingProspects)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.eligibleProspects)}</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.campaigns)}</DataTableTd>
              <DataTableTd className="text-right">{r.replyRate}%</DataTableTd>
              <DataTableTd className="text-right">{r.meetingRate}%</DataTableTd>
              <DataTableTd className="text-right">{r.qualificationRate}%</DataTableTd>
              <DataTableTd className="text-right">{formatNumber(r.opportunities)}</DataTableTd>
              <DataTableTd className="text-right">{formatCurrency(r.pipeline)}</DataTableTd>
              <DataTableTd className="text-right font-bold text-slate-900">{formatCurrency(r.revenue)}</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
