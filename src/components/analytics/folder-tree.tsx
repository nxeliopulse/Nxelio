"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FolderRow, FolderType } from "@/lib/queries/analytics-folders";

/** Category tree for one section (Dashboards or Reports). Built on the same
 *  expand/collapse interaction pattern already used by the app's main
 *  Sidebar (expandedItems record + rotating chevron), reimplemented here
 *  since that logic is private to sidebar.tsx. Fixed, seeded taxonomy in v1
 *  — folders are read-only containers, not yet user-creatable/nestable from
 *  this tree. */
export function FolderTree({ type, folders }: { type: FolderType; folders: FolderRow[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeFolder = searchParams.get("folder");
  const activeType = searchParams.get("type");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const roots = folders.filter((f) => !f.parentFolderId).sort((a, b) => a.sortOrder - b.sortOrder);
  const childrenOf = (id: string) => folders.filter((f) => f.parentFolderId === id).sort((a, b) => a.sortOrder - b.sortOrder);

  function renderNode(folder: FolderRow, depth: number) {
    const kids = childrenOf(folder.id);
    const isOpen = expanded[folder.id] ?? false;
    const isActive = activeType === type && activeFolder === folder.id;
    return (
      <div key={folder.id}>
        <div className="flex items-center" style={{ paddingLeft: depth * 14 }}>
          {kids.length > 0 && (
            <button onClick={() => setExpanded((e) => ({ ...e, [folder.id]: !isOpen }))} className="p-0.5 text-slate-400">
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")} />
            </button>
          )}
          <Link
            href={`${pathname === "/analytics" ? "/analytics" : "/analytics"}?type=${type}&folder=${folder.id}`}
            className={cn(
              "flex-1 flex items-center gap-1.5 px-1.5 py-1.5 rounded-md text-xs font-medium truncate",
              isActive ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/40"
            )}
          >
            <Folder className="h-3.5 w-3.5 flex-shrink-0" />
            {folder.name}
          </Link>
        </div>
        {isOpen && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <Link
        href={`/analytics?type=${type}`}
        className={cn(
          "flex items-center gap-1.5 px-1.5 py-1.5 rounded-md text-xs font-semibold truncate",
          activeType === type && !activeFolder ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400" : "text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900/40"
        )}
      >
        All {type === "dashboard" ? "dashboards" : "reports"}
      </Link>
      {roots.map((f) => renderNode(f, 0))}
    </div>
  );
}
