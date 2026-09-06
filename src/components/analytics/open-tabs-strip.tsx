"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, LayoutDashboard, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardSummary } from "@/lib/queries/analytics-dashboards";
import type { ReportDefinition } from "@/lib/analytics-reports";

interface RecentTab {
  href: string;
  title: string;
  kind: "dashboard" | "report";
}

const STORAGE_KEY = "nx-analytics-recent-tabs";
const MAX_TABS = 6;

function load(): RecentTab[] {
  try {
    const raw = typeof window !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function save(tabs: RecentTab[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // ignore
  }
}

/** A cheap, honest "recently opened" strip on top of normal navigation — not
 *  real multi-instance tabs. Clicking an item just navigates (router.push);
 *  browser back/forward is how a "tab" gets closed, matching every other
 *  detail view in this app. See the analytics rebuild plan for why this
 *  simplification was chosen over a real in-memory multi-tab store. */
export function OpenTabsStrip({ dashboards, reports }: { dashboards: DashboardSummary[]; reports: ReportDefinition[] }) {
  const pathname = usePathname();
  const router = useRouter();
  // Starts empty on both server and the client's first (hydration) render —
  // sessionStorage can only be read after mount. Reading it in a useState
  // lazy initializer instead (as this used to) makes the client's hydration
  // render diverge from the server-rendered HTML whenever a previous tab in
  // this session had non-empty sessionStorage: the server always renders
  // nothing here, but the client would try to render real tab markup during
  // hydration — a genuine hydration mismatch, not just a lint nitpick.
  const [tabs, setTabs] = useState<RecentTab[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable client-side, after mount; this can't run during the SSR-matching render
    setTabs(load());
  }, []);

  useEffect(() => {
    const dashMatch = pathname.match(/^\/analytics\/dashboards\/([^/]+)/);
    const reportMatch = pathname.match(/^\/analytics\/reports\/([^/]+)/);
    let entry: RecentTab | null = null;
    if (dashMatch) {
      const d = dashboards.find((x) => x.id === dashMatch[1]);
      if (d) entry = { href: pathname, title: d.name, kind: "dashboard" };
    } else if (reportMatch) {
      const r = reports.find((x) => x.id === reportMatch[1]);
      if (r) entry = { href: pathname, title: r.name, kind: "report" };
    }
    if (!entry) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the recent-tabs list to the current route on every navigation, not just mount
    setTabs((cur) => {
      const next = [entry as RecentTab, ...cur.filter((t) => t.href !== entry!.href)].slice(0, MAX_TABS);
      save(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function closeTab(href: string) {
    setTabs((cur) => {
      const next = cur.filter((t) => t.href !== href);
      save(next);
      return next;
    });
  }

  if (!tabs.length) return null;

  return (
    <div className="flex items-center gap-1.5 px-1 overflow-x-auto scrollbar-hide -mt-2">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <div
            key={tab.href}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors",
              active
                ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-800"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white"
            )}
            onClick={() => router.push(tab.href)}
          >
            {tab.kind === "dashboard" ? <LayoutDashboard className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /> : <FileText className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />}
            <span>{tab.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.href);
              }}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-1 rounded-sm hover:bg-black/5 dark:hover:bg-white/10 p-0.5 transition-colors"
              aria-label="Close tab"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
