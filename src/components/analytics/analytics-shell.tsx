"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, FileText, Database, Sparkles, Eye, EyeOff, Gauge, Users, PieChart, Megaphone, Mail, CalendarCheck, GitBranch, DollarSign, Building2, Bot, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAssistant } from "@/components/layout/assistant-context";
import { OpenTabsStrip } from "@/components/analytics/open-tabs-strip";
import type { DashboardSummary } from "@/lib/queries/analytics-dashboards";
import type { ReportDefinition } from "@/lib/analytics-reports";

const RAIL_ITEMS = [
  { key: "overview", label: "Overview", icon: Gauge, href: "/analytics/overview" },
  { key: "dashboards", label: "Dashboards", icon: LayoutDashboard, href: "/analytics?type=dashboard" },
  { key: "prospects", label: "Prospects", icon: Users, href: "/analytics/prospects" },
  { key: "segments", label: "Segments", icon: PieChart, href: "/analytics/segments" },
  { key: "campaigns", label: "Campaigns", icon: Megaphone, href: "/analytics/campaigns" },
  { key: "engagement", label: "Engagement", icon: Mail, href: "/analytics/engagement" },
  { key: "meetings", label: "Meetings", icon: CalendarCheck, href: "/analytics/meetings" },
  { key: "pipeline", label: "Pipeline", icon: GitBranch, href: "/analytics/pipeline" },
  { key: "revenue", label: "Revenue", icon: DollarSign, href: "/analytics/revenue" },
  { key: "accounts", label: "Accounts", icon: Building2, href: "/analytics/accounts" },
  { key: "ai-performance", label: "AI Performance", icon: Bot, href: "/analytics/ai-performance" },
  { key: "team", label: "Team", icon: Trophy, href: "/analytics/team" },
  { key: "reports", label: "Reports", icon: FileText, href: "/analytics?type=report" },
  { key: "data", label: "Data", icon: Database, href: "/analytics/data" },
];

export function AnalyticsShell({
  children,
  dashboards,
  reports,
}: {
  children: React.ReactNode;
  dashboards: DashboardSummary[];
  reports: ReportDefinition[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const { toggle } = useAssistant();
  const [viewerMode, setViewerMode] = useState(false);

  return (
    <div className="flex gap-0 -m-4 sm:-m-6 min-h-[calc(100vh-64px)]">
      {!viewerMode && (
        <div className="w-56 flex-shrink-0 border-r border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/20 p-3 space-y-4 overflow-y-auto">
          <div className="space-y-0.5">
            {RAIL_ITEMS.map((item) => {
              const active =
                item.key === "overview" ? pathname.startsWith("/analytics/overview") :
                item.key === "prospects" ? pathname.startsWith("/analytics/prospects") :
                item.key === "segments" ? pathname.startsWith("/analytics/segments") :
                item.key === "campaigns" ? pathname.startsWith("/analytics/campaigns") :
                item.key === "engagement" ? pathname.startsWith("/analytics/engagement") :
                item.key === "meetings" ? pathname.startsWith("/analytics/meetings") :
                item.key === "pipeline" ? pathname.startsWith("/analytics/pipeline") :
                item.key === "revenue" ? pathname.startsWith("/analytics/revenue") :
                item.key === "accounts" ? pathname.startsWith("/analytics/accounts") :
                item.key === "ai-performance" ? pathname.startsWith("/analytics/ai-performance") :
                item.key === "team" ? pathname.startsWith("/analytics/team") :
                item.key === "data" ? pathname.startsWith("/analytics/data") :
                item.key === "dashboards" ? pathname === "/analytics" && typeParam === "dashboard" :
                pathname === "/analytics" && typeParam === "report";
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-semibold",
                    active ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400" : "text-slate-700 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-900/40"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={toggle}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-900/40"
            >
              <Sparkles className="h-4 w-4" />
              AI Assistant
            </button>
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
