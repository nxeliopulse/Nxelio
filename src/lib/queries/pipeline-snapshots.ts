"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { calcWeightedForecast } from "@/lib/analytics/overview-metrics";
import { CLOSED_STAGES, getStageForecast, type OpportunityStage } from "@/lib/opportunities";

export interface PipelineSnapshotRow {
  snapshotDate: string;
  totalPipelineValue: number;
  weightedPipelineValue: number;
  openDealCount: number;
}

/** Called once daily by the protected cron route
 *  (/api/analytics/pipeline-snapshot/cron) — computes today's open-pipeline
 *  totals for every workspace and upserts one row each, using the
 *  service-role client since this runs with no user session. */
export async function recordDailyPipelineSnapshots(): Promise<{ workspacesProcessed: number }> {
  const admin = createAdminClient();
  const snapshotDate = new Date().toISOString().slice(0, 10);

  const { data: workspaces } = await admin.from("workspaces").select("id");
  const workspaceIds = ((workspaces as { id: string }[]) || []).map((w) => w.id);
  if (!workspaceIds.length) return { workspacesProcessed: 0 };

  const { data: oppsData } = await admin
    .from("opportunities")
    .select("workspace_id, deal_value, stage")
    .in("workspace_id", workspaceIds);
  const opps = (oppsData as { workspace_id: string; deal_value: number; stage: OpportunityStage }[]) || [];

  const byWorkspace = new Map<string, typeof opps>();
  for (const o of opps) {
    if (!byWorkspace.has(o.workspace_id)) byWorkspace.set(o.workspace_id, []);
    byWorkspace.get(o.workspace_id)!.push(o);
  }

  const rows = workspaceIds.map((workspaceId) => {
    const open = (byWorkspace.get(workspaceId) || []).filter((o) => !CLOSED_STAGES.includes(o.stage));
    return {
      workspace_id: workspaceId,
      snapshot_date: snapshotDate,
      total_pipeline_value: open.reduce((s, o) => s + Number(o.deal_value || 0), 0),
      weighted_pipeline_value: calcWeightedForecast(open.map((o) => ({ dealValue: Number(o.deal_value || 0), probabilityPercent: getStageForecast(o.stage).probability }))),
      open_deal_count: open.length,
    };
  });

  await admin.from("pipeline_snapshots").upsert(rows, { onConflict: "workspace_id,snapshot_date" });
  return { workspacesProcessed: rows.length };
}

/** The closest snapshot on or before `onOrBeforeIso` — used as the "predicted"
 *  weighted pipeline at the start of a Revenue Analytics date range, to
 *  compare against what actually closed by the end of it (Forecast
 *  Accuracy). Null until the cron has run at least once on/before that date. */
export async function getNearestPipelineSnapshot(onOrBeforeIso: string): Promise<PipelineSnapshotRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pipeline_snapshots")
    .select("snapshot_date, total_pipeline_value, weighted_pipeline_value, open_deal_count")
    .lte("snapshot_date", onOrBeforeIso)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as { snapshot_date: string; total_pipeline_value: number; weighted_pipeline_value: number; open_deal_count: number };
  return { snapshotDate: row.snapshot_date, totalPipelineValue: Number(row.total_pipeline_value), weightedPipelineValue: Number(row.weighted_pipeline_value), openDealCount: row.open_deal_count };
}

/** Real historical pipeline trend for the current workspace, used by Revenue
 *  Analytics' Pipeline Trend chart and Forecast Accuracy/Slippage. Empty
 *  until the cron has run at least once. */
export async function getPipelineTrend(fromIso: string, toIso: string): Promise<PipelineSnapshotRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pipeline_snapshots")
    .select("snapshot_date, total_pipeline_value, weighted_pipeline_value, open_deal_count")
    .gte("snapshot_date", fromIso)
    .lte("snapshot_date", toIso)
    .order("snapshot_date", { ascending: true });
  return ((data as { snapshot_date: string; total_pipeline_value: number; weighted_pipeline_value: number; open_deal_count: number }[]) || []).map((r) => ({
    snapshotDate: r.snapshot_date,
    totalPipelineValue: Number(r.total_pipeline_value),
    weightedPipelineValue: Number(r.weighted_pipeline_value),
    openDealCount: r.open_deal_count,
  }));
}
