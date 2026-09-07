import "server-only";
import type { createAdminClient } from "@/lib/supabase/server";

type Db = ReturnType<typeof createAdminClient>;

/** A job left in 'processing' for longer than this is assumed to belong to an
 *  instance that died mid-send, and is returned to the queue. Comfortably
 *  longer than the cron route's maxDuration (60s) so a slow-but-alive run is
 *  never stolen out from under itself. */
const STALE_CLAIM_MS = 15 * 60 * 1000;

/**
 * Atomically takes ownership of due queue rows so that only one app instance
 * can process any given job.
 *
 * The naive version of this — SELECT the pending rows, send, then mark them
 * sent — is safe with a single instance and silently wrong behind a load
 * balancer: every replica reads the same rows on the same tick and the
 * prospect receives the message once per replica.
 *
 * The claim is a conditional UPDATE. Under READ COMMITTED a competing
 * transaction blocks on the row, then re-checks `status = 'pending'` against
 * the committed value, no longer matches, and updates nothing — so a row is
 * returned to exactly one caller and the losers simply get a shorter list.
 */
export async function claimDueJobs<T extends { id: string }>(
  db: Db,
  table: "outreach_jobs" | "campaign_jobs",
  limit: number,
): Promise<T[]> {
  const nowIso = new Date().toISOString();

  // Return jobs stranded by an instance that died mid-send before looking for
  // new work, so an interrupted send is retried rather than lost.
  await db
    .from(table)
    .update({ status: "pending", claimed_at: null, updated_at: nowIso })
    .eq("status", "processing")
    .lt("claimed_at", new Date(Date.now() - STALE_CLAIM_MS).toISOString());

  const { data: candidates } = await db
    .from(table)
    .select("id")
    .eq("status", "pending")
    .lte("run_at", nowIso)
    .order("run_at", { ascending: true })
    .limit(limit);

  if (!candidates?.length) return [];

  // .eq("status", "pending") is what makes this a claim rather than a plain
  // update: rows another instance already took fail the predicate and are
  // absent from the returned set.
  const { data: claimed } = await db
    .from(table)
    .update({ status: "processing", claimed_at: nowIso, updated_at: nowIso })
    .in("id", candidates.map((c) => (c as { id: string }).id))
    .eq("status", "pending")
    .select("*");

  return (claimed ?? []) as T[];
}
