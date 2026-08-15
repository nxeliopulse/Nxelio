import { getAccountsAnalytics } from "@/lib/queries/analytics-accounts";
import { AccountsView } from "@/components/analytics/accounts/accounts-view";

export default async function AnalyticsAccountsPage() {
  const data = await getAccountsAnalytics();
  return <AccountsView data={data} />;
}
