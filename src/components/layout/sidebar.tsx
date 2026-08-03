"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getAiCreditsUsage, type AiCreditsUsage } from "@/lib/queries/credits";
import { onCreditsChanged } from "@/lib/credits-refresh";
import { Sparkles, HelpCircle, PanelLeftClose, PanelLeftOpen, ChevronDown, AlertTriangle } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { navMainItems, navAdminItems, sidebarAdminItems, filterNavByRoleAndOverrides, isNavItemAllowed } from "@/lib/nav-config";
import { useSidebar } from "./sidebar-context";

const EXPANDED = "w-[210px]";
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
  const [nowMs] = useState(() => Date.now());
  // Once already on the top plan there's nothing to upgrade to.
  const canUpgrade = !credits || NEXT_PLAN[credits.planId] !== null;
  // Real trial-expired check: a trial end date in the past, on a workspace that never converted to paid.
  const trialExpired = Boolean(
    credits?.trialEndsAt &&
    credits.status !== "active" &&
    new Date(credits.trialEndsAt).getTime() < nowMs
  );
  const trialExpiredDate = trialExpired && credits?.trialEndsAt
    ? new Date(credits.trialEndsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleExpanded = (label: string) => {
    setExpandedItems((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  // Auto-expand menu group when pathname matches one of its sub-items
  useEffect(() => {
    navMainItems.forEach((item) => {
      if (item.items) {
        const hasActiveSubItem = item.items.some(
          (sub) => pathname === sub.href || pathname.startsWith(sub.href + "/")
        ) || pathname === item.href;
        if (hasActiveSubItem) {
          setExpandedItems((prev) => ({ ...prev, [item.label]: true }));
        }
      }
    });
  }, [pathname]);

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
  const admin = filterNavByRoleAndOverrides(sidebarAdminItems, role, navAccess);
  const canViewBilling = isNavItemAllowed(navAdminItems, "/billing", role, navAccess);

  function renderItem(item: (typeof navMainItems)[number], exactActive: boolean) {
    const Icon = item.icon;
    const active = exactActive
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");

    if (collapsed) {
      return (
        <li key={item.label} className="flex justify-center">
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

    if (item.items) {
      const isExpanded = expandedItems[item.label] ?? false;
      const hasActiveSubItem = item.items.some(
        (sub) => pathname === sub.href || pathname.startsWith(sub.href + "/")
      );

      return (
        <li key={item.label} className="space-y-1">
          <button
            type="button"
            onClick={() => toggleExpanded(item.label)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-sm font-semibold transition-colors group",
              hasActiveSubItem
                ? "bg-white/20 text-white shadow-xs"
                : "text-white/85 hover:bg-white/15 hover:text-white"
            )}
          >
            <div className="flex items-center gap-3">
              <Icon
                className={cn(
                  "h-5 w-5 flex-shrink-0",
                  hasActiveSubItem ? "text-white" : "text-white/75 group-hover:text-white"
                )}
                strokeWidth={2}
              />
              <span className="flex-1 whitespace-nowrap text-left">{item.label}</span>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200 text-white/60 group-hover:text-white",
                isExpanded && "rotate-180"
              )}
            />
          </button>
          {isExpanded && (
            <ul className="pl-9 space-y-1">
              {item.items.map((sub) => {
                const subActive = pathname === sub.href || pathname.startsWith(sub.href + "/");
                return (
                  <li key={sub.href}>
                    <Link
                      href={sub.href}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors",
                        subActive
                          ? "bg-white/25 text-white ring-1 ring-white/35 shadow-xs"
                          : "text-white/75 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <span className="flex-1 whitespace-nowrap text-left">{sub.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
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
        {/* Header Logo — aligned with Topbar height (h-16) */}
        <div className={cn("h-16 py-2.5 flex items-center flex-shrink-0", collapsed ? "justify-center px-2" : "px-4")}>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            suppressHydrationWarning
            className={cn("flex items-center gap-2.5 group w-full", collapsed && "justify-center")}
          >
            <span className="relative h-9 w-9 rounded-xl bg-white flex items-center justify-center font-bold flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform overflow-hidden">
              <LogoMark className="h-full w-full transition-opacity duration-200 group-hover:opacity-0" />
              <PanelLeftClose className={cn("absolute h-4 w-4 text-slate-800 opacity-0 group-hover:opacity-100 transition-opacity duration-200", collapsed && "hidden")} />
              <PanelLeftOpen className={cn("absolute h-4 w-4 text-slate-800 opacity-0 group-hover:opacity-100 transition-opacity duration-200", !collapsed && "hidden")} />
            </span>
            {!collapsed && (
              <span className="flex flex-col leading-tight whitespace-nowrap text-left">
                <span className="font-bold text-white text-[15px] tracking-tight">
                  Nxelio Nurture
                </span>
                <span className="text-[11px] text-white/80 font-bold uppercase tracking-wider mt-0.5">AI NURTURE</span>
              </span>
            )}
          </button>
        </div>

        <nav className={cn("flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-3 space-y-5", collapsed ? "px-2" : "px-3")}>
          <div>
            {!collapsed && <p className="px-3 mb-2 text-[10px] font-extrabold uppercase tracking-wider text-white/85">Main Menu</p>}
            <ul data-tour-id="dashboard-sidebar-nav" className="space-y-1">{main.map((item) => renderItem(item, false))}</ul>
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
                {canUpgrade ? "Upgrade plan →" : "Manage plan →"}
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

          {/* Trial expired notice — only rendered when the real trial end date has passed */}
          {trialExpired && (collapsed ? (
            <div className="flex justify-center">
              <Link
                href="/billing"
                title={`Free trial expired ${trialExpiredDate}`}
                className="flex items-center justify-center h-10 w-10 rounded-xl bg-rose-950/60 text-rose-400 ring-1 ring-rose-900/60 hover:bg-rose-950 transition-colors"
              >
                <AlertTriangle className="h-4.5 w-4.5" />
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl bg-rose-950/50 ring-1 ring-rose-900/50 p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-white text-sm">Free trial</p>
                  <p className="text-xs font-semibold text-rose-400 mt-0.5">Expired {trialExpiredDate}</p>
                </div>
                <div className="h-8 w-8 rounded-full ring-2 ring-rose-500 text-rose-500 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </div>
              </div>
              <Link
                href="/billing"
                className="flex items-center justify-center w-full py-2 rounded-xl bg-black/40 ring-1 ring-white/25 text-white text-xs font-bold hover:bg-black/60 transition-colors"
              >
                Upgrade
              </Link>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
