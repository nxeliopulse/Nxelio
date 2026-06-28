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

const EXPANDED = "w-64";        // 256px
const COLLAPSED = "w-[84px]";   // icon-only rail — wide enough to center 44px tiles

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

  function renderItem(item: (typeof navMainItems)[number], exactActive: boolean) {
    const Icon = item.icon;
    const active = exactActive
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");
    const showBadge = item.href === "/inbox" && inboxUnread > 0;
    const badgeLabel = inboxUnread > 9 ? "9+" : inboxUnread;

    // Collapsed: a centered, circular/rounded tile. Active = filled violet with
    // a soft circular shadow so the selection reads clearly on the slim rail.
    if (collapsed) {
      return (
        <li key={item.href} className="flex justify-center">
          <Link
            href={item.href}
            title={item.label}
            className={cn(
              "relative flex items-center justify-center h-11 w-11 rounded-2xl transition-all duration-200",
              active
                ? "bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/40"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            )}
          >
            <Icon className="h-[21px] w-[21px]" strokeWidth={2} />
            {showBadge && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center ring-2 ring-white">
                {badgeLabel}
              </span>
            )}
          </Link>
        </li>
      );
    }

    // Expanded: full icon + label row.
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-colors group",
            active
              ? "bg-violet-50 text-violet-700 shadow-sm shadow-violet-200/60"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          )}
        >
          <Icon className={cn("h-5 w-5 flex-shrink-0", active ? "text-violet-600" : "text-slate-400 group-hover:text-slate-600")} strokeWidth={2} />
          <span className="flex-1 whitespace-nowrap">{item.label}</span>
          {showBadge && (
            <span className="bg-violet-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {badgeLabel}
            </span>
          )}
        </Link>
      </li>
    );
  }

  return (
    <aside
      className={cn(
        "hidden lg:flex h-screen sticky top-0 bg-white overflow-hidden transition-[width] duration-300 ease-in-out flex-shrink-0",
        collapsed ? COLLAPSED : EXPANDED
      )}
    >
      <div className="w-full flex flex-col h-full">
        {/* Header — logo doubles as the collapse/expand toggle. Centered on the rail. */}
        <div className={cn("h-16 flex items-center flex-shrink-0", collapsed ? "justify-center px-2" : "px-4")}>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex items-center gap-2.5 group"
          >
            <span className="relative h-11 w-11 rounded-2xl bg-gradient-to-br from-violet-600 via-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30 ring-1 ring-white/10 flex-shrink-0">
              <LogoMark className="h-[22px] w-[22px] text-white transition-opacity group-hover:opacity-0" />
              <PanelLeftClose className={cn("absolute h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity", collapsed && "hidden")} />
              <PanelLeftOpen className={cn("absolute h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity", !collapsed && "hidden")} />
            </span>
            {!collapsed && (
              <span className="flex flex-col leading-none whitespace-nowrap text-left">
                <span className="font-bold text-slate-900 text-lg tracking-tight">
                  Lead<span className="text-violet-600">Pro</span>
                </span>
                <span className="text-[10px] text-slate-500 font-medium uppercase tracking-[0.12em]">AI Engagement</span>
              </span>
            )}
          </button>
        </div>

        <nav className={cn("flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-6", collapsed ? "px-2" : "px-3")}>
          <div>
            {!collapsed && <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Workspace</p>}
            <ul className="space-y-1.5">{main.map((item) => renderItem(item, false))}</ul>
          </div>

          {admin.length > 0 && (
            <div>
              {!collapsed && <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Admin</p>}
              <ul className="space-y-1.5">{admin.map((item) => renderItem(item, true))}</ul>
            </div>
          )}
        </nav>

        <div className={cn("py-3 space-y-2 flex-shrink-0", collapsed ? "px-2" : "px-3")}>
          {/* AI credits — collapses to a centered circular tile */}
          {collapsed ? (
            <div className="flex justify-center">
              <Link
                href="/billing"
                title={credits ? `AI Credits — ${credits.used}/${credits.total} used` : "AI Credits"}
                className="flex items-center justify-center h-11 w-11 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/30"
              >
                <Sparkles className="h-5 w-5" />
              </Link>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-violet-600 to-purple-600 rounded-2xl p-4 text-white overflow-hidden">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 flex-shrink-0" />
                <p className="font-semibold text-sm whitespace-nowrap">AI Credits</p>
              </div>
              <p className="text-xs text-violet-100 mb-2 whitespace-nowrap">
                {credits ? `${credits.used.toLocaleString()} / ${credits.total.toLocaleString()} used` : "Loading..."}
              </p>
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: credits ? `${Math.min(100, Math.round((credits.used / credits.total) * 100))}%` : "0%" }} />
              </div>
              <Link href="/billing" className="mt-3 inline-block text-xs font-medium text-white/90 hover:text-white whitespace-nowrap">Upgrade plan →</Link>
            </div>
          )}

          {/* Help & support */}
          {collapsed ? (
            <div className="flex justify-center">
              <Link
                href="/help"
                title="Help & Support"
                className="flex items-center justify-center h-11 w-11 rounded-2xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <HelpCircle className="h-5 w-5" />
              </Link>
            </div>
          ) : (
            <Link
              href="/help"
              className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <HelpCircle className="h-5 w-5 text-slate-400 flex-shrink-0" />
              <span className="whitespace-nowrap">Help &amp; Support</span>
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
