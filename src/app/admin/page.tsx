import { redirect } from "next/navigation";
import { isPlatformAdmin, getPlatformLeadArchive } from "@/lib/queries/platform-admin";
import {
  getPlatformOverviewStats,
  getAllSubscriptions,
  getHotCustomers,
  getPlatformOverviewTrend,
  getWorkspacesNeedingAttention,
} from "@/lib/queries/platform-overview";
import { getVendorSubscriptions } from "@/lib/queries/platform-vendor-subscriptions";
import { getAiProviderStatus } from "@/lib/queries/ai-provider-settings";
import { getEmailPromoCodes } from "@/lib/queries/admin-promo-codes";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export default async function AdminPage() {
  if (!(await isPlatformAdmin())) redirect("/login");

  const [
    stats,
    hotCustomers,
    subscriptions,
    leadArchive,
    vendorSubscriptions,
    aiProviderStatus,
    trendData,
    attentionWorkspaces,
    promoCodes,
  ] = await Promise.all([
    getPlatformOverviewStats(),
    getHotCustomers(),
    getAllSubscriptions(),
    getPlatformLeadArchive(),
    getVendorSubscriptions(),
    getAiProviderStatus(),
    getPlatformOverviewTrend(),
    getWorkspacesNeedingAttention(),
    getEmailPromoCodes(),
  ]);

  return (
    <AdminDashboard
      stats={stats}
      hotCustomers={hotCustomers}
      subscriptions={subscriptions}
      leadArchive={leadArchive}
      vendorSubscriptions={vendorSubscriptions}
      aiProviderStatus={aiProviderStatus}
      trendData={trendData}
      attentionWorkspaces={attentionWorkspaces}
      promoCodes={promoCodes}
    />
  );
}
