import { LayoutDashboard, FileText } from "lucide-react";
import type { ExplorerItem } from "@/components/analytics/item-card";

export function ItemListRow({ item, onClick }: { item: ExplorerItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900/40 border-b border-slate-50 dark:border-slate-800/60 last:border-0"
    >
      <span className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.kind === "dashboard" ? "bg-blue-50 text-blue-600" : "bg-teal-50 text-teal-600"}`}>
        {item.kind === "dashboard" ? <LayoutDashboard className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{item.name}</p>
        <p className="text-xs text-slate-400 truncate">{item.subtitle}</p>
      </div>
      <span className="text-[11px] font-semibold text-slate-400 uppercase flex-shrink-0">{item.kind}</span>
    </button>
  );
}
