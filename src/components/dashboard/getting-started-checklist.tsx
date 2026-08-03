"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, PartyPopper } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ChecklistItem } from "@/lib/getting-started";

export function GettingStartedChecklist({ items }: { items: ChecklistItem[] }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  const go = (item: ChecklistItem) => {
    if (item.done) return;
    router.push(item.tourPageKey ? `${item.href}?tour=${item.tourPageKey}` : item.href);
  };

  return (
    <Card
      data-tour-id="dashboard-getting-started"
      className="bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs rounded-xl overflow-hidden w-full"
    >
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between p-4 sm:p-5 pb-3 text-left"
      >
        <div className="flex items-center gap-2">
          {allDone ? (
            <PartyPopper className="h-4 w-4 text-amber-500" />
          ) : (
            <span className="h-4 w-1 bg-rose-500 rounded-full inline-block" />
          )}
          <h5 className="text-sm font-bold text-slate-900 dark:text-white">Getting Started</h5>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-800">
            {doneCount}/{items.length} complete
          </span>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
      </button>

      <div className="px-4 sm:px-5">
        <div className="w-full bg-slate-100 dark:bg-slate-900 rounded-full h-1.5 border border-slate-200 dark:border-slate-800 mb-1">
          <div className="bg-rose-500 h-1 rounded-full transition-all" style={{ width: `${(doneCount / items.length) * 100}%` }} />
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 sm:p-5 pt-3 space-y-1.5">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => go(item)}
              disabled={item.done}
              className={cn(
                "w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors",
                item.done
                  ? "text-slate-400 dark:text-slate-500 cursor-default"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/50"
              )}
            >
              {item.done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-slate-300 dark:text-slate-700 flex-shrink-0" />
              )}
              <span className={cn(item.done && "line-through")}>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
