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

const EXPANDED = "w-64";
const COLLAPSED = "w-[84px]";

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

    if (collapsed) {
      return (
        <li key={item.href} className="flex justify-center">
          <Link
            href={item.href}
            title={item.label}
            className={cn(
              "relative flex items-center justify-center h-11 w-11 rounded-2xl transition-all duration-200",
              active
                ? "bg-white text-blue-600 shadow-lg shadow-black/20"
                : "text-white/60 hover:bg-white/15 hover:text-white"
            )}
          >
            <Icon className="h-[21px] w-[21px]" strokeWidth={2} />
            {showBadge && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center ring-2 ring-blue-600">
                {badgeLabel}
              </span>
            )}
          </Link>
        </li>
      );
    }

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-colors group",
            active
              ? "bg-white/15 text-white ring-1 ring-white/20"
              : "text-white/60 hover:bg-white/10 hover:text-white"
          )}
        >
          <Icon className={cn("h-5 w-5 flex-shrink-0", active ? "text-white" : "text-white/50 group-hover:text-white")} strokeWidth={2} />
          <span className="flex-1 whitespace-nowrap">{item.label}</span>
          {showBadge && (
            <span className="bg-white text-blue-600 text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
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
        "hidden lg:flex h-screen sticky top-0 bg-blue-600 overflow-hidden transition-[width] duration-300 ease-in-out flex-shrink-0",
        collapsed ? COLLAPSED : EXPANDED
      )}
    >
      <div className="w-full flex flex-col h-full">
        {/* Header */}
        <div className={cn("h-16 flex items-center flex-shrink-0", collapsed ? "justify-center px-2" : "px-4")}>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex items-center gap-2.5 group"
          >
            <span className="relative h-11 w-11 rounded-2xl bg-white/15 flex items-center justify-center ring-1 ring-white/20 flex-shrink-0 group-hover:bg-white/20 transition-colors">
              <LogoMark className="h-[22px] w-[22px] text-white transition-opacity group-hover:opacity-0" />
              <PanelLeftClose className={cn("absolute h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity", collapsed && "hidden")} />
              <PanelLeftOpen className={cn("absolute h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity", !collapsed && "hidden")} />
            </span>
            {!collapsed && (
              <span className="flex flex-col leading-none whitespace-nowrap text-left">
                <span className="font-bold text-white text-lg tracking-tight">
                  Lead<span className="text-white/70">Pro</span>
                </span>
                <span className="text-[10px] text-white/50 font-medium uppercase tracking-[0.12em]">AI Engagement</span>
              </span>
            )}
          </button>
        </div>

        <nav className={cn("flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-6", collapsed ? "px-2" : "px-3")}>
          <div>
            {!collapsed && <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">Workspace</p>}
            <ul className="space-y-1.5">{main.map((item) => renderItem(item, false))}</ul>
          </div>

          {admin.length > 0 && (
            <div>
              {!collapsed && <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">Admin</p>}
              <ul className="space-y-1.5">{admin.map((item) => renderItem(item, true))}</ul>
            </div>
          )}
        </nav>

        <div className={cn("py-3 space-y-2 flex-shrink-0", collapsed ? "px-2" : "px-3")}>
          {/* AI credits */}
          {collapsed ? (
            <div className="flex justify-center">
              <Link
                href="/billing"
                title={credits ? `AI Credits — ${credits.used}/${credits.total} used` : "AI Credits"}
                className="flex items-center justify-center h-11 w-11 rounded-2xl bg-white/15 text-white hover:bg-white/20 transition-colors ring-1 ring-white/20"
              >
                <Sparkles className="h-5 w-5" />
              </Link>
            </div>
          ) : (
            <div className="bg-white/10 rounded-2xl p-4 text-white overflow-hidden ring-1 ring-white/15">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 flex-shrink-0" />
                <p className="font-semibold text-sm whitespace-nowrap">AI Credits</p>
              </div>
              <p className="text-xs text-white/60 mb-2 whitespace-nowrap">
                {credits ? `${credits.used.toLocaleString()} / ${credits.total.toLocaleString()} used` : "Loading..."}
              </p>
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: credits ? `${Math.min(100, Math.round((credits.used / credits.total) * 100))}%` : "0%" }} />
              </div>
              <Link href="/billing" className="mt-3 inline-block text-xs font-medium text-white/70 hover:text-white whitespace-nowrap">Upgrade plan →</Link>
            </div>
          )}

          {/* Help & support */}
          {collapsed ? (
            <div className="flex justify-center">
              <Link
                href="/help"
                title="Help & Support"
                className="flex items-center justify-center h-11 w-11 rounded-2xl text-white/50 hover:bg-white/10 hover:text-white transition-colors"
              >
                <HelpCircle className="h-5 w-5" />
              </Link>
            </div>
          ) : (
            <Link
              href="/help"
              className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            >
              <HelpCircle className="h-5 w-5 flex-shrink-0" />
              <span className="whitespace-nowrap">Help &amp; Support</span>
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
