import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import type { QualificationByDimensionRow } from "@/lib/queries/analytics-meetings";

function MiniTable({ title, rows }: { title: string; rows: QualificationByDimensionRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-0 border-0"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableTh>{title.replace("Qualification by ", "")}</DataTableTh>
            <DataTableTh className="text-right">Qualified</DataTableTh>
            <DataTableTh className="text-right">Rate</DataTableTh>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.length === 0 && <DataTableEmpty colSpan={3}>No data for this selection.</DataTableEmpty>}
          {rows.slice(0, 8).map((r) => (
            <DataTableRow key={r.label}>
              <DataTableTd className="font-medium">{r.label}</DataTableTd>
              <DataTableTd className="text-right">{r.qualified}</DataTableTd>
              <DataTableTd className="text-right">{r.qualificationRate}%</DataTableTd>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}

export function QualificationBreakdown({
  bySource,
  byOwner,
  byIndustry,
  ownerNames,
}: {
  bySource: QualificationByDimensionRow[];
  byOwner: QualificationByDimensionRow[];
  byIndustry: QualificationByDimensionRow[];
  ownerNames: Record<string, string>;
}) {
  const ownerRows = byOwner.map((r) => ({ ...r, label: ownerNames[r.label] || r.label }));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <MiniTable title="Qualification by Source" rows={bySource} />
      <MiniTable title="Qualification by Owner" rows={ownerRows} />
      <MiniTable title="Qualification by Industry" rows={byIndustry} />
    </div>
  );
}
