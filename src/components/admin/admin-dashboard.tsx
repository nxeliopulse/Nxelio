"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, LayoutDashboard, Archive, CreditCard, Plug, Sparkles, Sun, Moon, Ticket, MessageCircle, ShieldAlert, Users, CalendarClock, PhoneCall, XCircle } from "lucide-react";
import { platformAdminSignOut } from "@/lib/queries/platform-admin";
import { OverviewTab } from "@/components/admin/overview-tab";
import { SubscriptionsTab } from "@/components/admin/subscriptions-tab";
import { AdminLeadArchiveView } from "@/components/admin/lead-archive-view";
import { VendorSubscriptionsTab } from "@/components/admin/vendor-subscriptions-tab";
import { AiProviderTab } from "@/components/admin/ai-provider-tab";
import { LeadProviderTab } from "@/components/admin/lead-provider-tab";
import { PromoCodesTab } from "@/components/admin/promo-codes-tab";
import { FeatureKillSwitchesTab } from "@/components/admin/feature-kill-switches-tab";
import { DemoRequestsTab } from "@/components/admin/demo-requests-tab";
import { DemoCallAdminTab } from "@/components/admin/demo-call-admin-tab";
import type { DemoCallPerson, DemoCallSlot } from "@/lib/queries/demo-call-admin";
import { CancellationsTab } from "@/components/admin/cancellations-tab";
import type { CancellationRequest } from "@/lib/queries/cancellation-types";
import type { CalendarAccountRow } from "@/lib/queries/calendar-accounts";
import { Modal } from "@/components/ui/modal";
import { WhatsAppConnectorView } from "@/components/settings/connectors-view";
import type { OutreachAccountRow } from "@/lib/queries/outreach-accounts";
import type { KillSwitchFeature } from "@/lib/kill-switch-rules";
import type {
  PlatformOverviewStats,
  HotCustomerRow,
  SubscriptionRow,
  PlatformOverviewTrendPoint,
  WorkspaceAttentionItem,
} from "@/lib/queries/platform-overview";
import type { LeadArchiveRow } from "@/lib/queries/lead-import-archive";
import type { VendorSubscriptionRow } from "@/lib/queries/platform-vendor-subscriptions";
import type { AiProviderStatus } from "@/lib/queries/ai-provider-settings";
import type { LeadProviderStatus } from "@/lib/queries/lead-provider-settings";
import type { EmailPromoCodeRow } from "@/lib/queries/admin-promo-codes";
import type { DemoRequestRow } from "@/lib/queries/demo-requests-admin";
import { LogoMark } from "@/components/brand/logo";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "subscriptions", label: "Subscriptions", icon: CreditCard },
  { id: "promo-codes", label: "Promo Codes", icon: Ticket },
  { id: "demo-requests", label: "Demo Requests", icon: CalendarClock },
  { id: "demo-call-admin", label: "Demo Call Admin", icon: PhoneCall },
  { id: "leads", label: "Leads Archive", icon: Archive },
  { id: "vendors", label: "Our Vendor Subscriptions", icon: Plug },
  { id: "ai-provider", label: "AI Provider", icon: Sparkles },
  { id: "lead-provider", label: "Lead Provider", icon: Users },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "feature-access", label: "Feature Access", icon: ShieldAlert },
  { id: "cancellations", label: "Cancellations", icon: XCircle },
] as const;

export function AdminDashboard({
  stats,
  hotCustomers,
  subscriptions,
  leadArchive,
  vendorSubscriptions,
  aiProviderStatus,
  leadProviderStatus,
  trendData,
  attentionWorkspaces,
  promoCodes,
  whatsappAccounts,
  unipileConfigured,
  featureKillSwitches,
  demoRequests,
  demoCallPeople,
  demoCallSlots,
  cancellationRequests,
  calendarAccounts,
  calendarProviderStatus,
}: {
  stats: PlatformOverviewStats;
  hotCustomers: HotCustomerRow[];
  subscriptions: SubscriptionRow[];
  leadArchive: (LeadArchiveRow & { workspace_name: string | null })[];
  vendorSubscriptions: VendorSubscriptionRow[];
  aiProviderStatus: AiProviderStatus;
  leadProviderStatus: LeadProviderStatus;
  trendData: PlatformOverviewTrendPoint[];
  attentionWorkspaces: WorkspaceAttentionItem[];
  promoCodes: EmailPromoCodeRow[];
  whatsappAccounts: OutreachAccountRow[];
  unipileConfigured: boolean;
  featureKillSwitches: Record<KillSwitchFeature, boolean>;
  demoRequests: DemoRequestRow[];
  demoCallPeople: DemoCallPerson[];
  demoCallSlots: DemoCallSlot[];
  cancellationRequests: CancellationRequest[];
  calendarAccounts: CalendarAccountRow[];
  calendarProviderStatus: { google: boolean; microsoft: boolean; zoho: boolean };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const [signingOut, setSigningOut] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from the DOM class on mount (SSR has no access to it)
    setIsDark(document.documentElement.classList.contains("dark"));

    // Land on the requested tab after an OAuth round-trip (e.g. the calendar
    // connect flow returns to /admin?tab=cancellations) — the tab list here
    // is client-side state, not URL-driven, so without this the user would
    // land back on "Overview" and have to re-find their way to Cancellations.
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested && TABS.some(t => t.id === requested)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from a URL param on mount
      setTab(requested as (typeof TABS)[number]["id"]);
    }
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
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            onClick={() => setLogoutConfirmOpen(true)}
            disabled={signingOut}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-[var(--muted)] transition-all shadow-sm disabled:opacity-50"
          >
            <LogOut className="h-4 w-4 text-slate-500 dark:text-slate-500" /> {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>

      <Modal open={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} size="sm">
        <div className="p-8 flex flex-col items-center text-center">
          <div className="h-16 w-16 rounded-full bg-indigo-50 flex items-center justify-center mb-5">
            <LogOut className="h-7 w-7 text-indigo-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Are You Sure You Want To Log Out?</h2>
          <p className="text-sm text-slate-500 mb-6">
            Your data will be safe. Once you log in, you can view your data.
          </p>
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={() => setLogoutConfirmOpen(false)}
              disabled={signingOut}
              className="flex-1 py-2.5 rounded-full text-sm font-semibold border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-70"
            >
              {signingOut ? "Signing out…" : "Log Out"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Navigation Tabs Bar */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 mb-8 overflow-x-auto shadow-sm scrollbar-hide">
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
        {tab === "overview" && (
          <OverviewTab
            stats={stats}
            hotCustomers={hotCustomers}
            trendData={trendData}
            attentionWorkspaces={attentionWorkspaces}
          />
        )}
        {tab === "subscriptions" && <SubscriptionsTab rows={subscriptions} />}
        {tab === "promo-codes" && <PromoCodesTab initialCodes={promoCodes} />}
        {tab === "demo-requests" && <DemoRequestsTab rows={demoRequests} />}
        {tab === "demo-call-admin" && <DemoCallAdminTab initialPeople={demoCallPeople} initialSlots={demoCallSlots} />}
        {tab === "leads" && <AdminLeadArchiveView rows={leadArchive} />}
        {tab === "vendors" && <VendorSubscriptionsTab rows={vendorSubscriptions} />}
        {tab === "ai-provider" && <AiProviderTab status={aiProviderStatus} />}
        {tab === "lead-provider" && <LeadProviderTab status={leadProviderStatus} />}
        {tab === "whatsapp" && (
          <WhatsAppConnectorView isSuperAdmin whatsappAccounts={whatsappAccounts} connectorReady={unipileConfigured} />
        )}
        {tab === "feature-access" && <FeatureKillSwitchesTab initialSwitches={featureKillSwitches} />}
        {tab === "cancellations" && (
          <CancellationsTab
            initialRequests={cancellationRequests}
            calendarAccounts={calendarAccounts}
            calendarProviderStatus={calendarProviderStatus}
          />
        )}
      </div>
    </div>
  );
}

