"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { X, Sparkles, HelpCircle, ChevronDown } from "lucide-react";
import { getAiCreditsUsage } from "@/lib/queries/credits";
import { onCreditsChanged } from "@/lib/credits-refresh";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { navMainItems, sidebarAdminItems, filterNavByRoleAndOverrides } from "@/lib/nav-config";

export function MobileSidebar({ open, onClose, role, navAccess }: { open: boolean; onClose: () => void; role?: string; navAccess?: Record<string, boolean> | null }) {
  const pathname = usePathname();
  const [credits, setCredits] = useState<{ used: number; total: number } | null>(null);

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
    Activities: true,
  });

  const toggleExpanded = (label: string) => {
    setExpandedItems((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  // Close the drawer on navigation; onClose is stable enough not to need in deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onClose(); }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    getAiCreditsUsage().then((c) => { if (!cancelled) setCredits(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return onCreditsChanged(() => {
      getAiCreditsUsage().then(setCredits).catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const main = filterNavByRoleAndOverrides(navMainItems, role, navAccess);
  const admin = filterNavByRoleAndOverrides(sidebarAdminItems, role, navAccess);

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-screen w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col transition-transform lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <Logo />
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-6">
          <div>
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Workspace</p>
            <ul className="space-y-0.5">
              {main.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(item.href + "/");

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
                          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
                          hasActiveSubItem ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={cn("h-4.5 w-4.5 flex-shrink-0", hasActiveSubItem ? "text-blue-600" : "text-slate-400")} strokeWidth={2} />
                          <span className="flex-1 text-left">{item.label}</span>
                        </div>
                        <ChevronDown className={cn("h-4 w-4 transition-transform duration-200 text-slate-400", isExpanded && "rotate-180")} />
                      </button>
                      {isExpanded && (
                        <ul className="pl-9 space-y-1">
                          {item.items.map((sub) => {
                            const subActive = pathname === sub.href || pathname.startsWith(sub.href + "/");
                            return (
                              <li key={sub.href}>
                                <Link
                                  href={sub.href}
                                  onClick={onClose}
                                  className={cn(
                                    "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                                    subActive ? "text-blue-600 font-semibold" : "text-slate-500 hover:text-slate-800"
                                  )}
                                >
                                  <span>{sub.label}</span>
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
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
                        active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      <Icon className={cn("h-4.5 w-4.5 flex-shrink-0", active ? "text-blue-600" : "text-slate-400")} strokeWidth={2} />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {admin.length > 0 && (
            <div>
              <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Admin</p>
              <ul className="space-y-0.5">
                {admin.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
                          active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                      >
                        <Icon className={cn("h-4.5 w-4.5", active ? "text-blue-600" : "text-slate-400")} strokeWidth={2} />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </nav>

        <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl p-4 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4.5 w-4.5" />
              <p className="font-bold text-base tracking-tight">AI Credits</p>
            </div>
            <p className="text-sm font-medium text-white/90 mb-2.5">
              {credits ? `${credits.used.toLocaleString()} / ${credits.total.toLocaleString()} used` : "Loading..."}
            </p>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: credits ? `${Math.min(100, Math.round((credits.used / credits.total) * 100))}%` : "0%" }} />
            </div>
            <Link href="/billing" onClick={onClose} className="text-xs font-semibold text-white/90 hover:text-white underline-offset-2 hover:underline inline-block">Upgrade plan →</Link>
          </div>

          <Link href="/help" onClick={onClose} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
            <HelpCircle className="h-4.5 w-4.5 text-slate-400" />
            Help & Support
          </Link>
        </div>
      </aside>
    </>
  );
}
