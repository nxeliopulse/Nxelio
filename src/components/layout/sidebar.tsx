"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getAiCreditsUsage } from "@/lib/queries/credits";
import { getUnreadInboxCount } from "@/lib/queries/inbox";
import { Sparkles, HelpCircle, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { navMainItems, navAdminItems, filterNavByRoleAndOverrides } from "@/lib/nav-config";
import { useSidebar } from "./sidebar-context";

const EXPANDED = "w-64";       // 256px
const COLLAPSED = "w-[76px]";

export function Sidebar({ role, navAccess }: { role?: string; navAccess?: Record<string, boolean> | null }) {
  const pathname = usePathname();
  const { collapsed, toggleCollapsed } = useSidebar();
  const [credits, setCredits] = useState<{ used: number; total: number } | null>(null);
  const [inboxUnread, setInboxUnread] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    getAiCreditsUsage().then((c) => { if (!cancelled) setCredits(c); }).catch(() => {});
    getUnreadInboxCount().then((n) => { if (!cancelled) setInboxUnread(n); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const main = filterNavByRoleAndOverrides(navMainItems, role, navAccess);
  const admin = filterNavByRoleAndOverrides(navAdminItems, role, navAccess);

  // Label fades out as the sidebar clips it — smooth, with no layout reflow.
  const label = cn("flex-1 whitespace-nowrap transition-opacity duration-200", collapsed ? "opacity-0" : "opacity-100");

  function renderItem(item: (typeof navMainItems)[number], exactActive: boolean) {
    const Icon = item.icon;
    const active = exactActive
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");
    const showBadge = item.href === "/inbox" && inboxUnread > 0;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          title={collapsed ? item.label : undefined}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
            active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          )}
        >
          <span className="relative flex-shrink-0">
            <Icon className={cn("h-4.5 w-4.5", active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600")} strokeWidth={2} />
            {showBadge && collapsed && (
              <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[9px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                {inboxUnread > 9 ? "9+" : inboxUnread}
              </span>
            )}
          </span>
          <span className={label}>{item.label}</span>
          {showBadge && (
            <span className={cn("bg-blue-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center transition-opacity duration-200", collapsed ? "opacity-0" : "opacity-100")}>
              {inboxUnread > 9 ? "9+" : inboxUnread}
            </span>
          )}
        </Link>
      </li>
    );
  }

  return (
    <aside
      className={cn(
        "hidden lg:flex h-screen sticky top-0 bg-white border-r border-slate-200 overflow-hidden transition-[width] duration-300 ease-in-out",
        collapsed ? COLLAPSED : EXPANDED
      )}
    >
      {/* Fixed-width inner — the outer clips it, so nothing reflows on collapse */}
      <div className="w-64 flex flex-col h-full flex-shrink-0">
        {/* Header — the logo doubles as the collapse / expand toggle.
            h-16 matches the topbar so their bottom borders align. */}
        <div className="h-16 flex items-center px-4 border-b border-slate-200 flex-shrink-0">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex items-center gap-2.5 group"
          >
            <span className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 ring-1 ring-white/10 flex-shrink-0">
              <LogoMark className="h-[22px] w-[22px] text-white transition-opacity group-hover:opacity-0" />
              <PanelLeftClose className={cn("absolute h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity", collapsed && "hidden")} />
              <PanelLeftOpen className={cn("absolute h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity", !collapsed && "hidden")} />
            </span>
            <span className={cn("flex flex-col leading-none whitespace-nowrap text-left transition-opacity duration-200", collapsed ? "opacity-0" : "opacity-100")}>
              <span className="font-bold text-slate-900 text-lg tracking-tight">
                Lead<span className="text-blue-600">Pro</span>
              </span>
              <span className="text-[10px] text-slate-500 font-medium uppercase tracking-[0.12em]">AI Engagement</span>
            </span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-6">
          <div>
            <p className={cn("px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap transition-opacity duration-200", collapsed ? "opacity-0" : "opacity-100")}>Workspace</p>
            <ul className="space-y-0.5">{main.map((item) => renderItem(item, false))}</ul>
          </div>

          {admin.length > 0 && (
            <div>
              <p className={cn("px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap transition-opacity duration-200", collapsed ? "opacity-0" : "opacity-100")}>Admin</p>
              <ul className="space-y-0.5">{admin.map((item) => renderItem(item, true))}</ul>
            </div>
          )}
        </nav>

        <div className="p-3 border-t border-slate-100 space-y-2 flex-shrink-0">
          {/* AI credits — collapses to a compact icon tile */}
          {collapsed ? (
            <Link
              href="/billing"
              title={credits ? `AI Credits — ${credits.used}/${credits.total} used` : "AI Credits"}
              className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white"
            >
              <Sparkles className="h-5 w-5" />
            </Link>
          ) : (
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl p-4 text-white overflow-hidden">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 flex-shrink-0" />
                <p className="font-semibold text-sm whitespace-nowrap">AI Credits</p>
              </div>
              <p className="text-xs text-blue-100 mb-2 whitespace-nowrap">
                {credits ? `${credits.used.toLocaleString()} / ${credits.total.toLocaleString()} used` : "Loading..."}
              </p>
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: credits ? `${Math.min(100, Math.round((credits.used / credits.total) * 100))}%` : "0%" }} />
              </div>
              <Link href="/billing" className="mt-3 inline-block text-xs font-medium text-white/90 hover:text-white whitespace-nowrap">Upgrade plan →</Link>
            </div>
          )}

          <Link
            href="/help"
            title={collapsed ? "Help & Support" : undefined}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <HelpCircle className="h-4.5 w-4.5 text-slate-400 flex-shrink-0" />
            <span className={cn("whitespace-nowrap transition-opacity duration-200", collapsed ? "opacity-0" : "opacity-100")}>Help &amp; Support</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
