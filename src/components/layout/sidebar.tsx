"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getAiCreditsUsage, type AiCreditsUsage } from "@/lib/queries/credits";
import { onCreditsChanged } from "@/lib/credits-refresh";
import { Sparkles, HelpCircle, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { navMainItems, navAdminItems, filterNavByRoleAndOverrides, isNavItemAllowed } from "@/lib/nav-config";
import { useSidebar } from "./sidebar-context";

const EXPANDED = "w-64";
const COLLAPSED = "w-[84px]";

// The plan one tier above the current one — null once already on the top plan.
const NEXT_PLAN: Record<string, string | null> = {
  basic: "Starter",
  starter: "Pro",
  pro: null,
};

export function Sidebar({ role, navAccess }: { role?: string; navAccess?: Record<string, boolean> | null }) {
  const pathname = usePathname();
  const { collapsed, toggleCollapsed } = useSidebar();
  const [credits, setCredits] = useState<AiCreditsUsage | null>(null);
  const nextPlan = credits ? NEXT_PLAN[credits.planId] : "Starter";

  useEffect(() => {
    let cancelled = false;
    getAiCreditsUsage().then((c) => { if (!cancelled) setCredits(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);

  // Refetch immediately after any AI feature deducts a credit — without this,
  // the widget only updates on the next route change.
  useEffect(() => {
    return onCreditsChanged(() => {
      getAiCreditsUsage().then(setCredits).catch(() => {});
    });
  }, []);

  const main = filterNavByRoleAndOverrides(navMainItems, role, navAccess);
  const admin = filterNavByRoleAndOverrides(navAdminItems, role, navAccess);
  const canViewBilling = isNavItemAllowed(navAdminItems, "/billing", role, navAccess);

  function renderItem(item: (typeof navMainItems)[number], exactActive: boolean) {
    const Icon = item.icon;
    const active = exactActive
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");

    if (collapsed) {
      return (
        <li key={item.href} className="flex justify-center">
          <Link
            href={item.href}
            title={item.label}
            className={cn(
              "relative flex items-center justify-center h-11 w-11 rounded-2xl transition-all duration-200",
              active
                ? "bg-white text-blue-600 shadow-lg shadow-black/20 font-bold"
                : "text-white/80 hover:bg-white/20 hover:text-white"
            )}
          >
            <Icon className="h-[21px] w-[21px]" strokeWidth={2} />
          </Link>
        </li>
      );
    }

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-colors group",
            active
              ? "bg-white/25 text-white ring-1 ring-white/35 shadow-xs"
              : "text-white/85 hover:bg-white/15 hover:text-white"
          )}
        >
          <Icon className={cn("h-5 w-5 flex-shrink-0", active ? "text-white" : "text-white/75 group-hover:text-white")} strokeWidth={2} />
          <span className="flex-1 whitespace-nowrap">{item.label}</span>
        </Link>
      </li>
    );
  }

  return (
    <aside
      className={cn(
        "hidden lg:flex h-screen sticky top-0 bg-[var(--primary)] overflow-hidden transition-[width] duration-300 ease-in-out flex-shrink-0 z-40",
        collapsed ? COLLAPSED : EXPANDED
      )}
    >
      <div className="w-full flex flex-col h-full">
        {/* Header Logo */}
        <div className={cn("h-14 flex items-center flex-shrink-0", collapsed ? "justify-center px-2" : "px-4")}>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            suppressHydrationWarning
            className={cn("flex items-center gap-2.5 group w-full", collapsed && "justify-center")}
          >
            <span className="relative h-9 w-9 rounded-xl bg-white flex items-center justify-center font-bold flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
              <LogoMark className="h-5 w-5 text-orange-500 transition-opacity duration-200 group-hover:opacity-0" />
              <PanelLeftClose className={cn("absolute h-4 w-4 text-slate-800 opacity-0 group-hover:opacity-100 transition-opacity duration-200", collapsed && "hidden")} />
              <PanelLeftOpen className={cn("absolute h-4 w-4 text-slate-800 opacity-0 group-hover:opacity-100 transition-opacity duration-200", !collapsed && "hidden")} />
            </span>
            {!collapsed && (
              <span className="flex flex-col leading-none whitespace-nowrap text-left">
                <span className="font-bold text-white text-base tracking-tight">
                  Nxelio
                </span>
                <span className="text-[10px] text-white/80 font-bold uppercase tracking-widest mt-0.5">AI Engagement</span>
              </span>
            )}
          </button>
        </div>

        <nav className={cn("flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-5", collapsed ? "px-2" : "px-3")}>
          <div>
            {!collapsed && <p className="px-3 mb-2 text-[10px] font-extrabold uppercase tracking-wider text-white/85">Main Menu</p>}
            <ul className="space-y-1">{main.map((item) => renderItem(item, false))}</ul>
          </div>

          {admin.length > 0 && (
            <div>
              {!collapsed && <p className="px-3 mb-2 text-[10px] font-extrabold uppercase tracking-wider text-white/85">Admin</p>}
              <ul className="space-y-1">{admin.map((item) => renderItem(item, true))}</ul>
            </div>
          )}
        </nav>

        <div className={cn("py-3 space-y-2 flex-shrink-0", collapsed ? "px-2" : "px-3")}>
          {/* AI Credits Widget */}
          {!canViewBilling ? null : collapsed ? (
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
            <div className="bg-white/15 rounded-2xl p-4 text-white overflow-hidden ring-1 ring-white/20">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4.5 w-4.5 flex-shrink-0" />
                <p className="font-bold text-base tracking-tight">AI Credits</p>
              </div>
              <p className="text-sm font-medium text-white/90 mb-2.5 whitespace-nowrap">
                {credits ? `${credits.used.toLocaleString()} / ${credits.total.toLocaleString()} used` : "Loading..."}
              </p>
              <div className="h-2 bg-white/25 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: credits ? `${Math.min(100, Math.round((credits.used / credits.total) * 100))}%` : "0%" }}
                />
              </div>
              <Link
                href="/billing"
                className="inline-block text-xs font-semibold text-white/90 hover:text-white underline-offset-2 hover:underline whitespace-nowrap"
              >
                Upgrade plan →
              </Link>
            </div>
          )}

          {/* Help & support */}
          {collapsed ? (
            <div className="flex justify-center">
              <Link
                href="/help"
                title="Help & Support"
                className="flex items-center justify-center h-10 w-10 rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <HelpCircle className="h-4.5 w-4.5" />
              </Link>
            </div>
          ) : (
            <Link
              href="/help"
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <HelpCircle className="h-4 w-4 flex-shrink-0" />
              <span className="whitespace-nowrap">Help &amp; Support</span>
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
