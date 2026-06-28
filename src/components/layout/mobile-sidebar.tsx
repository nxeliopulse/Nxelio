"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { X, Sparkles, HelpCircle } from "lucide-react";
import { getAiCreditsUsage } from "@/lib/queries/credits";
import { getUnreadInboxCount } from "@/lib/queries/inbox";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { navMainItems, navAdminItems, filterNavByRoleAndOverrides } from "@/lib/nav-config";

export function MobileSidebar({ open, onClose, role, navAccess }: { open: boolean; onClose: () => void; role?: string; navAccess?: Record<string, boolean> | null }) {
  const pathname = usePathname();
  const [credits, setCredits] = useState<{ used: number; total: number } | null>(null);
  const [inboxUnread, setInboxUnread] = useState<number>(0);

  useEffect(() => { onClose(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    getAiCreditsUsage().then((c) => { if (!cancelled) setCredits(c); }).catch(() => {});
    getUnreadInboxCount().then((n) => { if (!cancelled) setInboxUnread(n); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const main = filterNavByRoleAndOverrides(navMainItems, role, navAccess);
  const admin = filterNavByRoleAndOverrides(navAdminItems, role, navAccess);

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

        <nav className="flex-1 overflow-y-auto p-3 space-y-6">
          <div>
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Workspace</p>
            <ul className="space-y-0.5">
              {main.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const showBadge = item.href === "/inbox" && inboxUnread > 0;
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
                      {showBadge && (
                        <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                          {inboxUnread > 9 ? "9+" : inboxUnread}
                        </span>
                      )}
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

        <div className="p-3 border-t border-slate-100 space-y-2">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl p-4 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4" />
              <p className="font-semibold text-sm">AI Credits</p>
            </div>
            <p className="text-xs text-blue-100 mb-2">
              {credits ? `${credits.used.toLocaleString()} / ${credits.total.toLocaleString()} used` : "Loading..."}
            </p>
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: credits ? `${Math.min(100, Math.round((credits.used / credits.total) * 100))}%` : "0%" }} />
            </div>
            <Link href="/billing" onClick={onClose} className="mt-3 text-xs font-medium text-white/90 hover:text-white inline-block">Upgrade plan →</Link>
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
