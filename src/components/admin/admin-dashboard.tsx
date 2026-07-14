"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, LayoutDashboard, Archive, CreditCard, Plug } from "lucide-react";
import { platformAdminSignOut } from "@/lib/queries/platform-admin";
import { OverviewTab } from "@/components/admin/overview-tab";
import { SubscriptionsTab } from "@/components/admin/subscriptions-tab";
import { AdminLeadArchiveView } from "@/components/admin/lead-archive-view";
import { VendorSubscriptionsTab } from "@/components/admin/vendor-subscriptions-tab";
import type { PlatformOverviewStats, HotCustomerRow, SubscriptionRow } from "@/lib/queries/platform-overview";
import type { LeadArchiveRow } from "@/lib/queries/lead-import-archive";
import type { VendorSubscriptionRow } from "@/lib/queries/platform-vendor-subscriptions";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "subscriptions", label: "Subscriptions", icon: CreditCard },
  { id: "leads", label: "Leads Archive", icon: Archive },
  { id: "vendors", label: "Our Vendor Subscriptions", icon: Plug },
] as const;

export function AdminDashboard({
  stats,
  hotCustomers,
  subscriptions,
  leadArchive,
  vendorSubscriptions,
}: {
  stats: PlatformOverviewStats;
  hotCustomers: HotCustomerRow[];
  subscriptions: SubscriptionRow[];
  leadArchive: (LeadArchiveRow & { workspace_name: string | null })[];
  vendorSubscriptions: VendorSubscriptionRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await platformAdminSignOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Nxelio Admin</h1>
          <p className="text-sm text-slate-400 mt-0.5">Platform-wide view — not the customer app.</p>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" /> {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-800 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-blue-500 text-blue-400" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab stats={stats} hotCustomers={hotCustomers} />}
      {tab === "subscriptions" && <SubscriptionsTab rows={subscriptions} />}
      {tab === "leads" && <AdminLeadArchiveView rows={leadArchive} />}
      {tab === "vendors" && <VendorSubscriptionsTab rows={vendorSubscriptions} />}
    </div>
  );
}
