import { createClient } from "@/lib/supabase/server";
import { getUsers } from "@/lib/queries/users";
import { getProspectsAnalytics, type ProspectsFilters } from "@/lib/queries/analytics-prospects";
import type { DateRangePreset, ComparisonMode } from "@/lib/analytics/overview-metrics";
import { ProspectsView } from "@/components/analytics/prospects/prospects-view";

const VALID_RANGES: DateRangePreset[] = ["today", "yesterday", "last_7_days", "last_30_days", "last_90_days", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "custom"];
const VALID_COMPARISONS: ComparisonMode[] = ["previous_period", "previous_month", "previous_quarter", "previous_year", "none"];

interface ProspectsSearchParams {
  range?: string;
  from?: string;
  to?: string;
  compare?: string;
  owner?: string;
  source?: string;
  industry?: string;
  companySize?: string;
  country?: string;
  status?: string;
  segment?: string;
  scoreMin?: string;
  scoreMax?: string;
}

export default async function AnalyticsProspectsPage({ searchParams }: { searchParams: Promise<ProspectsSearchParams> }) {
  const sp = await searchParams;
  const supabase = await createClient();

  const filters: ProspectsFilters = {
    dateRange: (VALID_RANGES.includes(sp.range as DateRangePreset) ? sp.range : "last_30_days") as DateRangePreset,
    customFrom: sp.from,
    customTo: sp.to,
    comparison: (VALID_COMPARISONS.includes(sp.compare as ComparisonMode) ? sp.compare : "previous_period") as ComparisonMode,
    owner: sp.owner,
    source: sp.source,
    industry: sp.industry,
    companySize: sp.companySize,
    country: sp.country,
    status: sp.status,
    segmentId: sp.segment,
    aiScoreMin: sp.scoreMin ? Number(sp.scoreMin) : undefined,
    aiScoreMax: sp.scoreMax ? Number(sp.scoreMax) : undefined,
  };

  const [data, { data: segmentsData }, { data: facetsData }, users] = await Promise.all([
    getProspectsAnalytics(filters),
    supabase.from("segments").select("id, segment_name").order("segment_name"),
    supabase.from("leads").select("source, industry, company_size, country, status"),
    getUsers(),
  ]);

  const facets = facetsData || [];
  const distinct = (key: "source" | "industry" | "company_size" | "country" | "status") =>
    Array.from(new Set(facets.map((f) => f[key]).filter(Boolean) as string[])).sort();

  return (
    <ProspectsView
      data={data}
      filters={filters}
      sources={distinct("source")}
      industries={distinct("industry")}
      companySizes={distinct("company_size")}
      countries={distinct("country")}
      statuses={distinct("status")}
      segments={(segmentsData as { id: string; segment_name: string }[]) || []}
      users={users.map((u) => ({ id: u.user_id, name: u.full_name }))}
      ownerNames={Object.fromEntries(users.map((u) => [u.user_id, u.full_name]))}
    />
  );
}
