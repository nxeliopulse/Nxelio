"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getAnalyticsContext } from "@/lib/queries/analytics-overview";

interface InsightLike {
  id: string;
  title: string;
  ctaLabel: string;
  ctaHref: string;
}

/** Filters out insights the user has already dismissed for this area, caps
 *  to 5 (matching every page's existing `.slice(0, 5)`), and records a
 *  sighting for each visible one — new insights get inserted as 'active',
 *  previously-seen ones just get last_seen_at bumped. Called at the end of
 *  each of the 8 analytics query modules that surface AI Insights. */
export async function filterAndRecordRecommendations<T extends InsightLike>(area: string, insights: T[]): Promise<T[]> {
  if (!insights.length) return [];
  const supabase = await createClient();
  const ctx = await getAnalyticsContext();
  const fingerprints = insights.map((i) => `${area}:${i.id}`);

  const { data: existing } = await supabase
    .from("ai_recommendations")
    .select("id, fingerprint, status")
    .eq("workspace_id", ctx.workspaceId)
    .in("fingerprint", fingerprints);
  const byFingerprint = new Map(((existing as { id: string; fingerprint: string; status: string }[]) || []).map((r) => [r.fingerprint, r]));

  const visible = insights.filter((i) => byFingerprint.get(`${area}:${i.id}`)?.status !== "dismissed").slice(0, 5);

  const now = new Date().toISOString();
  const toInsert: { workspace_id: string; source_area: string; fingerprint: string; title: string; cta_label: string; cta_href: string }[] = [];
  const writes: PromiseLike<unknown>[] = [];
  for (const i of visible) {
    const fingerprint = `${area}:${i.id}`;
    const existingRow = byFingerprint.get(fingerprint);
    if (existingRow) {
      writes.push(supabase.from("ai_recommendations").update({ title: i.title, cta_label: i.ctaLabel, cta_href: i.ctaHref, last_seen_at: now }).eq("id", existingRow.id));
    } else {
      toInsert.push({ workspace_id: ctx.workspaceId, source_area: area, fingerprint, title: i.title, cta_label: i.ctaLabel, cta_href: i.ctaHref });
    }
  }
  if (toInsert.length) writes.push(supabase.from("ai_recommendations").insert(toInsert));
  await Promise.all(writes);

  return visible;
}

async function actionOnRecommendation(area: string, insightId: string, action: "accepted" | "dismissed") {
  const supabase = await createClient();
  const ctx = await getAnalyticsContext();
  const fingerprint = `${area}:${insightId}`;
  const { data: rec } = await supabase.from("ai_recommendations").select("id").eq("workspace_id", ctx.workspaceId).eq("fingerprint", fingerprint).maybeSingle();
  if (!rec) return;
  const recRow = rec as { id: string };
  await supabase.from("ai_recommendations").update({ status: action, actioned_at: new Date().toISOString(), actioned_by: ctx.userId }).eq("id", recRow.id);
  await supabase.from("ai_recommendation_actions").insert({ recommendation_id: recRow.id, workspace_id: ctx.workspaceId, user_id: ctx.userId, action });
  revalidatePath(`/analytics/${area}`);
  revalidatePath("/analytics/ai-performance");
}

export async function acceptRecommendation(area: string, insightId: string): Promise<void> {
  await actionOnRecommendation(area, insightId, "accepted");
}

export async function dismissRecommendation(area: string, insightId: string): Promise<void> {
  await actionOnRecommendation(area, insightId, "dismissed");
}

export interface RecommendationAdoptionStats {
  totalSurfaced: number;
  accepted: number;
  dismissed: number;
  adoptionRatePercent: number;
  /** Proxy metric: of the recommendations a user actually decided on
   *  (accepted or dismissed), what share were accepted. This schema has no
   *  deeper tracking of whether an accepted recommendation's underlying
   *  business outcome (e.g. the flagged deal actually closing) came true —
   *  that would need a second, longer-horizon join per insight type. Null
   *  until at least one recommendation has been decided on. */
  outcomeRatePercent: number | null;
}

export async function getRecommendationAdoption(): Promise<RecommendationAdoptionStats> {
  const supabase = await createClient();
  const ctx = await getAnalyticsContext();
  const { data } = await supabase.from("ai_recommendations").select("status").eq("workspace_id", ctx.workspaceId);
  const rows = (data as { status: string }[]) || [];
  const totalSurfaced = rows.length;
  const accepted = rows.filter((r) => r.status === "accepted").length;
  const dismissed = rows.filter((r) => r.status === "dismissed").length;
  const decided = accepted + dismissed;
  return {
    totalSurfaced,
    accepted,
    dismissed,
    adoptionRatePercent: totalSurfaced > 0 ? Math.round((accepted / totalSurfaced) * 1000) / 10 : 0,
    outcomeRatePercent: decided > 0 ? Math.round((accepted / decided) * 1000) / 10 : null,
  };
}
