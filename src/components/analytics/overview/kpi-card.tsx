import Link from "next/link";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Card } from "@/components/ui/card";

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
export function formatCurrency(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

interface KpiCardProps {
  label: string;
  value: string;
  changePercent?: number | null;
  detail?: string;
  href?: string;
}

/** One Overview KPI tile — value + optional period-over-period delta +
 *  optional secondary detail line, wrapped in a Link when drill-down is
 *  available (doc §13: every KPI must support drill-down). */
export function KpiCard({ label, value, changePercent, detail, href }: KpiCardProps) {
  const body = (
    <Card className={href ? "p-4 h-full transition-shadow hover:shadow-md cursor-pointer" : "p-4 h-full"}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">{label}</p>
      <div className="flex items-baseline gap-2 mt-1.5">
        <h4 className="text-2xl font-black text-slate-900 tracking-tight">{value}</h4>
        {changePercent != null && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${changePercent >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {changePercent >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(changePercent)}%
          </span>
        )}
      </div>
      {detail && <p className="text-xs text-slate-400 mt-1 truncate">{detail}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function KpiCardSkeleton() {
  return (
    <Card className="p-4 h-full animate-pulse">
      <div className="h-3 w-20 bg-slate-100 rounded" />
      <div className="h-7 w-24 bg-slate-100 rounded mt-2.5" />
      <div className="h-3 w-16 bg-slate-100 rounded mt-2" />
    </Card>
  );
}

export { formatNumber };
