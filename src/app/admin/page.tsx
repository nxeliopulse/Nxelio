import { getPlatformLeadArchive } from "@/lib/queries/platform-admin";
import {
  getPlatformOverviewStats,
  getAllSubscriptions,
  getHotCustomers,
  getPlatformOverviewTrend,
  getWorkspacesNeedingAttention,
} from "@/lib/queries/platform-overview";
import { getVendorSubscriptions } from "@/lib/queries/platform-vendor-subscriptions";
import { getAiProviderStatus } from "@/lib/queries/ai-provider-settings";
import { getLeadProviderStatus } from "@/lib/queries/lead-provider-settings";
import { getEmailPromoCodes } from "@/lib/queries/admin-promo-codes";
import { getOutreachAccounts, isUnipileConfigured } from "@/lib/queries/outreach-accounts";
import { getFeatureKillSwitches } from "@/lib/queries/feature-kill-switches";
import { getDemoRequests } from "@/lib/queries/demo-requests-admin";
import { getDemoCallPeople, getDemoCallSlots } from "@/lib/queries/demo-call-admin";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export default async function AdminPage() {
  const [
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
    outreachAccounts,
    unipileReady,
    featureKillSwitches,
    demoRequests,
    demoCallPeople,
    demoCallSlots,
  ] = await Promise.all([
    getPlatformOverviewStats(),
    getHotCustomers(),
    getAllSubscriptions(),
    getPlatformLeadArchive(),
    getVendorSubscriptions(),
    getAiProviderStatus(),
    getLeadProviderStatus(),
    getPlatformOverviewTrend(),
    getWorkspacesNeedingAttention(),
    getEmailPromoCodes(),
    getOutreachAccounts(),
    isUnipileConfigured(),
    getFeatureKillSwitches(),
    getDemoRequests(),
    getDemoCallPeople(),
    getDemoCallSlots(),
  ]);
  const whatsappAccounts = outreachAccounts.filter((a) => a.channel === "whatsapp");

  return (
    <AdminDashboard
      stats={stats}
      hotCustomers={hotCustomers}
      subscriptions={subscriptions}
      leadArchive={leadArchive}
      vendorSubscriptions={vendorSubscriptions}
      aiProviderStatus={aiProviderStatus}
      leadProviderStatus={leadProviderStatus}
      trendData={trendData}
      attentionWorkspaces={attentionWorkspaces}
      promoCodes={promoCodes}
      whatsappAccounts={whatsappAccounts}
      unipileConfigured={unipileReady}
      featureKillSwitches={featureKillSwitches}
      demoRequests={demoRequests}
      demoCallPeople={demoCallPeople}
      demoCallSlots={demoCallSlots}
    />
  );
}
