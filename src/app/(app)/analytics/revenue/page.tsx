import { getUsers } from "@/lib/queries/users";
import { getRevenueAnalytics, type RevenueFilters } from "@/lib/queries/analytics-revenue";
import type { DateRangePreset } from "@/lib/analytics/overview-metrics";
import { RevenueView } from "@/components/analytics/revenue/revenue-view";

const VALID_RANGES: DateRangePreset[] = ["today", "yesterday", "last_7_days", "last_30_days", "last_90_days", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "custom"];

export default async function AnalyticsRevenuePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const sp = await searchParams;
  const filters: RevenueFilters = {
    dateRange: (VALID_RANGES.includes(sp.range as DateRangePreset) ? sp.range : "last_90_days") as DateRangePreset,
  };
  const [data, users] = await Promise.all([getRevenueAnalytics(filters), getUsers()]);
  return <RevenueView data={data} filters={filters} ownerNames={Object.fromEntries(users.map((u) => [u.user_id, u.full_name]))} />;
}
