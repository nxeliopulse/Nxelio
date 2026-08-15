import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { QuickReportLink } from "@/lib/queries/analytics-overview";

/** Quick Reports shortcuts (doc §12). */
export function QuickReportsPanel({ reports }: { reports: QuickReportLink[] }) {
  return (
    <Card className="p-5">
      <CardHeader className="p-0 border-0 mb-3">
        <CardTitle className="text-sm">Quick Reports</CardTitle>
      </CardHeader>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {reports.map((r) => (
          <Link
            key={r.key}
            href={r.href}
            className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <span className="truncate">{r.label}</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          </Link>
        ))}
      </div>
    </Card>
  );
}
