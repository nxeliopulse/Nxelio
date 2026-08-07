"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Database, Sparkles, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAssistant } from "@/components/layout/assistant-context";
import { FolderTree } from "@/components/analytics/folder-tree";
import { OpenTabsStrip } from "@/components/analytics/open-tabs-strip";
import type { FolderRow } from "@/lib/queries/analytics-folders";
import type { DashboardSummary } from "@/lib/queries/analytics-dashboards";
import type { ReportDefinition } from "@/lib/analytics-reports";

const RAIL_ITEMS = [
  { key: "dashboards", label: "Dashboards", icon: LayoutDashboard, href: "/analytics?type=dashboard" },
  { key: "reports", label: "Reports", icon: FileText, href: "/analytics?type=report" },
  { key: "data", label: "Data", icon: Database, href: "/analytics/data" },
];

export function AnalyticsShell({
  children,
  dashboardFolders,
  reportFolders,
  dashboards,
  reports,
}: {
  children: React.ReactNode;
  dashboardFolders: FolderRow[];
  reportFolders: FolderRow[];
  dashboards: DashboardSummary[];
  reports: ReportDefinition[];
}) {
  const pathname = usePathname();
  const { toggle } = useAssistant();
  const [viewerMode, setViewerMode] = useState(false);

  return (
    <div className="flex gap-0 -m-4 sm:-m-6 min-h-[calc(100vh-64px)]">
      {!viewerMode && (
        <div className="w-56 flex-shrink-0 border-r border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/20 p-3 space-y-4 overflow-y-auto">
          <div className="space-y-0.5">
            {RAIL_ITEMS.map((item) => {
              const active = item.key === "data" ? pathname.startsWith("/analytics/data") : pathname === "/analytics" && item.href.includes(item.key === "dashboards" ? "dashboard" : "report");
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-semibold",
                    active ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400" : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900/40"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={toggle}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900/40"
            >
              <Sparkles className="h-4 w-4" />
              AI Assistant
            </button>
          </div>

          <div>
            <p className="px-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">Dashboards</p>
            <FolderTree type="dashboard" folders={dashboardFolders} />
          </div>
          <div>
            <p className="px-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">Reports</p>
            <FolderTree type="report" folders={reportFolders} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-slate-100 dark:border-slate-800">
          <OpenTabsStrip dashboards={dashboards} reports={reports} />
          <button
            onClick={() => setViewerMode((v) => !v)}
            className="flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900/40 ml-2"
            title={viewerMode ? "Show navigation" : "Hide navigation (viewer mode)"}
          >
            {viewerMode ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {viewerMode ? "Show nav" : "Viewer"}
          </button>
        </div>
        <div className="flex-1 p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
