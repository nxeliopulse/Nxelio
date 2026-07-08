import { getDashboardStats } from "@/lib/queries/analytics";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  return <DashboardView stats={stats} />;
}
