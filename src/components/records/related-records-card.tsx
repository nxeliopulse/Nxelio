import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { SidebarCard } from "./sidebar-card";

export type RelatedRecordItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  href: string | null;
  emptyText: string;
};

// Sidebar list of linked records (Account / Contact / Originating Lead, ...).
// An item with no href renders its emptyText instead of a dead link — never
// a fabricated "related activity" row.
export function RelatedRecordsCard({ title, items }: { title: string; items: RelatedRecordItem[] }) {
  return (
    <SidebarCard title={title}>
      <div className="space-y-2 text-xs">
        {items.map((item) =>
          item.href ? (
            <Link
              key={item.key}
              href={item.href}
              className="flex items-center justify-between gap-2 p-3 rounded-lg border border-slate-200 hover:border-blue-300 dark:border-slate-800 dark:hover:border-blue-500/50 transition-colors"
            >
              <span className="font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                {item.icon} {item.label}
              </span>
              <ExternalLink className="h-3 w-3 text-slate-300 dark:text-slate-600 flex-shrink-0" />
            </Link>
          ) : (
            <p key={item.key} className="text-slate-400 italic dark:text-slate-500">{item.emptyText}</p>
          )
        )}
      </div>
    </SidebarCard>
  );
}
