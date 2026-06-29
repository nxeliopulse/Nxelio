import { ArrowDown, ArrowUp, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: number;
  icon: React.ReactNode;
  accent?: "blue" | "emerald" | "amber" | "purple";
}

const accents = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  purple: "bg-indigo-50 text-indigo-600",
};

export function KpiCard({ label, value, delta, icon, accent = "blue" }: KpiCardProps) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="bg-white rounded-3xl p-5 shadow-[0_4px_24px_rgba(17,12,46,0.06)] hover:shadow-[0_8px_30px_rgba(17,12,46,0.10)] transition-shadow">
      {/* top row: icon + label, with a muted menu glyph to match the reference */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0", accents[accent])}>
            {icon}
          </div>
          <p className="text-sm font-medium text-slate-500 truncate">{label}</p>
        </div>
        <MoreHorizontal className="h-4 w-4 text-slate-300 flex-shrink-0" />
      </div>
      {/* value + inline delta pill */}
      <div className="flex items-end justify-between gap-2">
        <p className="text-3xl font-bold text-slate-900 tracking-tight">{value}</p>
        {delta !== undefined && (
          <span className={cn(
            "inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-lg mb-1",
            positive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
          )}>
            {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {positive ? "+" : "-"}{Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  );
}
