"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, LayoutDashboard, Archive, CreditCard, Plug, Sparkles, Sun, Moon } from "lucide-react";
import { platformAdminSignOut } from "@/lib/queries/platform-admin";
import { OverviewTab } from "@/components/admin/overview-tab";
import { SubscriptionsTab } from "@/components/admin/subscriptions-tab";
import { AdminLeadArchiveView } from "@/components/admin/lead-archive-view";
import { VendorSubscriptionsTab } from "@/components/admin/vendor-subscriptions-tab";
import { AiProviderTab } from "@/components/admin/ai-provider-tab";
import type { PlatformOverviewStats, HotCustomerRow, SubscriptionRow } from "@/lib/queries/platform-overview";
import type { LeadArchiveRow } from "@/lib/queries/lead-import-archive";
import type { VendorSubscriptionRow } from "@/lib/queries/platform-vendor-subscriptions";
import type { AiProviderStatus } from "@/lib/queries/ai-provider-settings";
import { LogoMark } from "@/components/brand/logo";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "subscriptions", label: "Subscriptions", icon: CreditCard },
  { id: "leads", label: "Leads Archive", icon: Archive },
  { id: "vendors", label: "Our Vendor Subscriptions", icon: Plug },
  { id: "ai-provider", label: "AI Provider", icon: Sparkles },
] as const;

export function AdminDashboard({
  stats,
  hotCustomers,
  subscriptions,
  leadArchive,
  vendorSubscriptions,
  aiProviderStatus,
}: {
  stats: PlatformOverviewStats;
  hotCustomers: HotCustomerRow[];
  subscriptions: SubscriptionRow[];
  leadArchive: (LeadArchiveRow & { workspace_name: string | null })[];
  vendorSubscriptions: VendorSubscriptionRow[];
  aiProviderStatus: AiProviderStatus;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const [signingOut, setSigningOut] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from the DOM class on mount (SSR has no access to it)
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      try { localStorage.setItem("theme", "dark"); } catch {}
    } else {
      document.documentElement.classList.remove("dark");
      try { localStorage.setItem("theme", "light"); } catch {}
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await platformAdminSignOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-2xl overflow-hidden bg-white flex items-center justify-center shadow-md shadow-[#18A7B8]/25 flex-shrink-0">
            <LogoMark className="h-full w-full" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              Nxelio Nurture Admin
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-500 font-medium mt-0.5">
              Platform-wide control center &mdash; not the customer app.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Theme Switcher Button */}
          <button
            onClick={toggleTheme}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-[var(--muted)] transition-all shadow-sm"
            title="Toggle Light / Dark theme"
          >
            {isDark ? (
              <>
                <Sun className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-semibold">Light</span>
              </>
            ) : (
              <>
                <Moon className="h-4 w-4 text-slate-500" />
                <span className="text-xs font-semibold">Dark</span>
              </>
            )}
          </button>

          {/* Sign Out Button */}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-[var(--muted)] transition-all shadow-sm disabled:opacity-50"
          >
            <LogOut className="h-4 w-4 text-slate-500 dark:text-slate-500" /> {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 mb-8 overflow-x-auto shadow-sm scrollbar-hide">
        {TABS.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                isActive
                  ? "bg-[#18A7B8] text-white shadow-md shadow-[#18A7B8]/20"
                  : "text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-[var(--muted)]"
              }`}
            >
              <t.icon className={`h-4 w-4 ${isActive ? "text-white" : "text-slate-400 dark:text-slate-500"}`} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="transition-all duration-300">
        {tab === "overview" && <OverviewTab stats={stats} hotCustomers={hotCustomers} />}
        {tab === "subscriptions" && <SubscriptionsTab rows={subscriptions} />}
        {tab === "leads" && <AdminLeadArchiveView rows={leadArchive} />}
        {tab === "vendors" && <VendorSubscriptionsTab rows={vendorSubscriptions} />}
        {tab === "ai-provider" && <AiProviderTab status={aiProviderStatus} />}
      </div>
    </div>
  );
}

