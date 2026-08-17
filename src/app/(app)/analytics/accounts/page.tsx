import { createClient } from "@/lib/supabase/server";
import { getAccountsAnalytics, type AccountsFilters } from "@/lib/queries/analytics-accounts";
import { AccountsView } from "@/components/analytics/accounts/accounts-view";

export default async function AnalyticsAccountsPage({ searchParams }: { searchParams: Promise<{ industry?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const filters: AccountsFilters = { industry: sp.industry };
  const [data, { data: accountsForFacets }] = await Promise.all([
    getAccountsAnalytics(filters),
    supabase.from("accounts").select("industry").not("industry", "is", null),
  ]);
  const industries = Array.from(new Set((accountsForFacets || []).map((a) => a.industry).filter(Boolean) as string[])).sort();
  return <AccountsView data={data} filters={filters} industries={industries} />;
}
