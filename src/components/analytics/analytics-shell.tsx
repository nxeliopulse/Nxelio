"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Database,
  Sparkles,
  LayoutGrid,
  ChevronDown,
  Gauge,
  Users,
  PieChart,
  Megaphone,
  Mail,
  CalendarCheck,
  GitBranch,
  DollarSign,
  Building2,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAssistant } from "@/components/layout/assistant-context";
import { OpenTabsStrip } from "@/components/analytics/open-tabs-strip";
import type { DashboardSummary } from "@/lib/queries/analytics-dashboards";
import type { ReportDefinition } from "@/lib/analytics-reports";

const PRIMARY_TABS = [
  {
    key: "explorer",
    label: "Explorer",
    icon: LayoutGrid,
    href: "/analytics",
    isActive: (pathname: string, typeParam: string | null) =>
      pathname === "/analytics" && !typeParam,
  },
  {
    key: "dashboards",
    label: "Dashboards",
    icon: LayoutDashboard,
    href: "/analytics?type=dashboard",
    isActive: (pathname: string, typeParam: string | null) =>
      (pathname === "/analytics" && typeParam === "dashboard") ||
      pathname.startsWith("/analytics/dashboards"),
  },
  {
    key: "reports",
    label: "Reports",
    icon: FileText,
    href: "/analytics?type=report",
    isActive: (pathname: string, typeParam: string | null) =>
      (pathname === "/analytics" && typeParam === "report") ||
      pathname.startsWith("/analytics/reports"),
  },
  {
    key: "data",
    label: "Data",
    icon: Database,
    href: "/analytics/data",
    isActive: (pathname: string) => pathname.startsWith("/analytics/data"),
  },
  {
    key: "ai-insights",
    label: "AI Insights",
    icon: Sparkles,
    href: "/analytics/ai-performance",
    isActive: (pathname: string) => pathname.startsWith("/analytics/ai-performance"),
  },
];

const DOMAIN_ITEMS = [
  { key: "overview", label: "Overview", icon: Gauge, href: "/analytics/overview" },
  { key: "prospects", label: "Prospects", icon: Users, href: "/analytics/prospects" },
  { key: "segments", label: "Segments", icon: PieChart, href: "/analytics/segments" },
  { key: "campaigns", label: "Campaigns", icon: Megaphone, href: "/analytics/campaigns" },
  { key: "engagement", label: "Engagement", icon: Mail, href: "/analytics/engagement" },
  { key: "meetings", label: "Meetings", icon: CalendarCheck, href: "/analytics/meetings" },
  { key: "pipeline", label: "Pipeline", icon: GitBranch, href: "/analytics/pipeline" },
  { key: "revenue", label: "Revenue", icon: DollarSign, href: "/analytics/revenue" },
  { key: "accounts", label: "Accounts", icon: Building2, href: "/analytics/accounts" },
  { key: "team", label: "Team", icon: Trophy, href: "/analytics/team" },
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close domains dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  // Close dropdown on route change
  useEffect(() => {
    setDropdownOpen(false);
  }, [pathname, searchParams]);

  const activeDomain = DOMAIN_ITEMS.find((d) => pathname.startsWith(d.href));

  return (
    <div className="space-y-6 pb-12">
      {/* Compact Horizontal Analytics Navigation Bar */}
      <div className="bg-white dark:bg-[#1b212e] border border-slate-200 dark:border-slate-800 rounded-2xl p-2 sm:p-2.5 shadow-xs flex items-center justify-between gap-3 flex-wrap relative z-30">
        {/* Navigation Tabs / Pills */}
        <div className="flex items-center gap-1.5 flex-wrap overflow-visible">
          {PRIMARY_TABS.map((tab) => {
            const active = tab.isActive(pathname, typeParam);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={cn(
                  "inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap",
                  active
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-white" : "text-slate-500 dark:text-slate-400")} />
                {tab.label}
              </Link>
            );
          })}

          {/* Domains Dropdown */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap",
                activeDomain
                  ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-800"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
              )}
            >
              {activeDomain ? (
                <>
                  <activeDomain.icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span>{activeDomain.label}</span>
                </>
              ) : (
                <span>Domains</span>
              )}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", dropdownOpen && "rotate-180")} />
            </button>

            {dropdownOpen && (
              <div className="absolute left-0 top-full mt-2 w-52 rounded-xl bg-white dark:bg-[#1b212e] border border-slate-200 dark:border-slate-800 shadow-2xl p-1.5 z-50 max-h-[75vh] overflow-y-auto">
                <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Domain Metrics
                </p>
                <div className="space-y-0.5 mt-0.5">
                  {DOMAIN_ITEMS.map((item) => {
                    const itemActive = pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        onClick={() => setDropdownOpen(false)}
                        className={cn(
                          "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors",
                          itemActive
                            ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold"
                            : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                        )}
                      >
                        <Icon className={cn("h-4 w-4", itemActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400")} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right side: AI Assistant button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggle}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200 dark:border-slate-800 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="hidden sm:inline">AI Assistant</span>
          </button>
        </div>
      </div>

      {/* Recently Opened Tabs Strip (rendered when tabs exist) */}
      <OpenTabsStrip dashboards={dashboards} reports={reports} />

      {/* Main Analytics Content */}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
