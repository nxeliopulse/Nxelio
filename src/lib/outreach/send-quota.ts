import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reserves up to `requested` sends against today's daily quota for this
 * workspace + channel (see migration 0070_outreach_send_limits.sql). Returns
 * how many are actually allowed to send right now — callers should send only
 * that many and defer the rest to the next quota window. Workspaces with no
 * limit configured for this channel get `requested` back unchanged (the DB
 * function is unthrottled by default), and any RPC error also fails open
 * rather than silently blocking every send in the workspace.
 */
export async function consumeSendQuota(
  db: SupabaseClient,
  workspaceId: string,
  channel: "email" | "linkedin",
  requested: number
): Promise<number> {
  if (requested <= 0) return 0;
  const { data, error } = await db.rpc("consume_send_quota", {
    p_workspace_id: workspaceId,
    p_channel: channel,
    p_requested: requested,
  });
  if (error || typeof data !== "number") return requested;
  return data;
}
