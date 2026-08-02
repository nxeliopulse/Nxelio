"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// Generic card shell for a detail-page section (Details, Key Information,
// Additional Information, ...). Reuses the same visual language as
// SidebarCard so left-column and right-column cards match. `collapsible`
// matches the chevron-toggle pattern already used elsewhere in this app's
// detail views (leads/accounts).
export function DetailCard({
  title,
  action,
  collapsible,
  defaultOpen = true,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs dark:bg-slate-900 dark:border-slate-800", className)}>
      <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between dark:bg-slate-950/40 dark:border-slate-800">
        <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{title}</span>
        <div className="flex items-center gap-2">
          {action}
          {collapsible && (
            <button
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Collapse" : "Expand"}
              className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
      {(!collapsible || open) && <div className="p-4">{children}</div>}
    </div>
  );
}
