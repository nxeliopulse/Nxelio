import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: number;
  icon: React.ReactNode;
  accent?: "blue" | "emerald" | "amber" | "purple";
}

const accents = {
  blue: "from-blue-500/10 to-blue-500/5 text-blue-600 ring-blue-100",
  emerald: "from-emerald-500/10 to-emerald-500/5 text-emerald-600 ring-emerald-100",
  amber: "from-amber-500/10 to-amber-500/5 text-amber-600 ring-amber-100",
  purple: "from-purple-500/10 to-purple-500/5 text-purple-600 ring-purple-100",
};

export function KpiCard({ label, value, delta, icon, accent = "blue" }: KpiCardProps) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className={cn("h-9 w-9 rounded-lg bg-gradient-to-br flex items-center justify-center ring-1", accents[accent])}>
          {icon}
        </div>
      </div>
      <div className="flex items-end justify-between">
        <p className="text-3xl font-bold text-slate-900 tracking-tight">{value}</p>
        {delta !== undefined && (
          <div className={cn("flex items-center gap-0.5 text-sm font-semibold", positive ? "text-emerald-600" : "text-red-600")}>
            {positive ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            {Math.abs(delta)}%
          </div>
        )}
      </div>
      {delta !== undefined && <p className="text-xs text-slate-400 mt-1">vs. last month</p>}
    </div>
  );
}
