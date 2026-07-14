import { redirect } from "next/navigation";
import { isPlatformAdmin, getPlatformLeadArchive } from "@/lib/queries/platform-admin";
import { getPlatformOverviewStats, getAllSubscriptions, getHotCustomers } from "@/lib/queries/platform-overview";
import { getVendorSubscriptions } from "@/lib/queries/platform-vendor-subscriptions";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export default async function AdminPage() {
  if (!(await isPlatformAdmin())) redirect("/login");

  const [stats, hotCustomers, subscriptions, leadArchive, vendorSubscriptions] = await Promise.all([
    getPlatformOverviewStats(),
    getHotCustomers(),
    getAllSubscriptions(),
    getPlatformLeadArchive(),
    getVendorSubscriptions(),
  ]);

  return (
    <AdminDashboard
      stats={stats}
      hotCustomers={hotCustomers}
      subscriptions={subscriptions}
      leadArchive={leadArchive}
      vendorSubscriptions={vendorSubscriptions}
    />
  );
}
