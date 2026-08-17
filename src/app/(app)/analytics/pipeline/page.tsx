import { createClient } from "@/lib/supabase/server";
import { getUsers } from "@/lib/queries/users";
import { getPipelineAnalytics, type PipelineFilters } from "@/lib/queries/analytics-pipeline";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";
import type { DateRangePreset } from "@/lib/analytics/overview-metrics";
import type { OpportunityStage } from "@/lib/opportunities";
import { PipelineView } from "@/components/analytics/pipeline/pipeline-view";

const VALID_RANGES: DateRangePreset[] = ["today", "yesterday", "last_7_days", "last_30_days", "last_90_days", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "custom"];

export default async function AnalyticsPipelinePage({ searchParams }: { searchParams: Promise<{ stage?: string; owner?: string; range?: string; from?: string; to?: string; source?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const filters: PipelineFilters = {
    stage: sp.stage as OpportunityStage | undefined,
    owner: sp.owner,
    dateRange: (VALID_RANGES.includes(sp.range as DateRangePreset) ? sp.range : "last_30_days") as DateRangePreset,
    customFrom: sp.from,
    customTo: sp.to,
    source: sp.source,
  };
  const [data, ctx, users, { data: leadsForFacets }] = await Promise.all([
    getPipelineAnalytics(filters),
    getAnalyticsContext(),
    getUsers(),
    supabase.from("leads").select("source").not("source", "is", null),
  ]);
  const sources = Array.from(new Set((leadsForFacets || []).map((l) => l.source).filter(Boolean) as string[])).sort();
  return (
    <PipelineView
      data={data}
      filters={filters}
      showTeamFilter={ctx.directReportIds.length > 0}
      sources={sources}
      ownerNames={Object.fromEntries(users.map((u) => [u.user_id, u.full_name]))}
    />
  );
}
