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
    <div className="flex items-center gap-1 border-b border-slate-100 dark:border-slate-800 px-2 overflow-x-auto">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <div
            key={tab.href}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px cursor-pointer whitespace-nowrap",
              active ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
            onClick={() => router.push(tab.href)}
          >
            {tab.kind === "dashboard" ? <LayoutDashboard className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
            {tab.title}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.href);
              }}
              className="text-slate-300 hover:text-slate-600"
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
