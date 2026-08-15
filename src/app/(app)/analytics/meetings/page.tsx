import { getUsers } from "@/lib/queries/users";
import { getMeetingsAnalytics, type MeetingsFilters } from "@/lib/queries/analytics-meetings";
import type { DateRangePreset } from "@/lib/analytics/overview-metrics";
import { MeetingsView } from "@/components/analytics/meetings/meetings-view";

const VALID_RANGES: DateRangePreset[] = ["today", "yesterday", "last_7_days", "last_30_days", "last_90_days", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "custom"];

export default async function AnalyticsMeetingsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const sp = await searchParams;
  const filters: MeetingsFilters = {
    dateRange: (VALID_RANGES.includes(sp.range as DateRangePreset) ? sp.range : "last_30_days") as DateRangePreset,
  };
  const [data, users] = await Promise.all([getMeetingsAnalytics(filters), getUsers()]);
  return <MeetingsView data={data} filters={filters} ownerNames={Object.fromEntries(users.map((u) => [u.user_id, u.full_name]))} />;
}
