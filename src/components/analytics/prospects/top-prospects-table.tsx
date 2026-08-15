import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import type { TopProspectRow } from "@/lib/queries/analytics-prospects";

const ENGAGEMENT_STYLE: Record<string, string> = {
  High: "text-emerald-600 bg-emerald-50",
  Medium: "text-amber-600 bg-amber-50",
  Low: "text-slate-500 bg-slate-50",
};

/** Top Prospects table (doc §10) — sorted AI Score descending server-side. */
export function TopProspectsTable({ prospects, ownerNames }: { prospects: TopProspectRow[]; ownerNames: Record<string, string> }) {
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
            <DataTableTh className="text-right">AI Score</DataTableTh>
            <DataTableTh>Buying Intent</DataTableTh>
            <DataTableTh>Engagement</DataTableTh>
            <DataTableTh>Last Activity</DataTableTh>
            <DataTableTh>Owner</DataTableTh>
            <DataTableTh>Status</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {prospects.length === 0 && <DataTableEmpty colSpan={10}>No prospects match the selected filters.</DataTableEmpty>}
          {prospects.map((p) => (
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
