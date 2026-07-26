"use server";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/queries/auth-guards";
import { revalidatePath } from "next/cache";

export type SendChannel = "email" | "linkedin";

export interface SendLimitRow {
  channel: SendChannel;
  daily_min: number;
  daily_max: number;
}

export interface SendLimitStatus {
  limited: boolean;
  daily_min?: number;
  daily_max?: number;
  /** Today's randomly-picked quota within [daily_min, daily_max] — unset until the first send attempt of the day. */
  quota?: number | null;
  sent_today?: number;
}

/** The workspace's configured daily limit for a channel, or null if unthrottled. */
export async function getSendLimit(channel: SendChannel): Promise<SendLimitRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outreach_send_limits")
    .select("channel, daily_min, daily_max")
    .eq("channel", channel)
    .maybeSingle();
  return (data as SendLimitRow | null) ?? null;
}

/** Today's usage against the configured limit (for "X of Y sent today" in Settings). */
export async function getSendLimitStatus(channel: SendChannel): Promise<SendLimitStatus> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("users").select("workspace_id").eq("user_id", user.id).single()
    : { data: null };
  const wsId = (profile as { workspace_id?: string } | null)?.workspace_id;
  if (!wsId) return { limited: false };
  const { data, error } = await supabase.rpc("remaining_send_quota", { p_workspace_id: wsId, p_channel: channel });
  if (error || !data) return { limited: false };
  return data as SendLimitStatus;
}

/** Sets (or replaces) the workspace's daily send-limit range for a channel. */
export async function setSendLimit(channel: SendChannel, dailyMin: number, dailyMax: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Forbidden" };
  }
  const min = Math.max(0, Math.round(dailyMin));
  const max = Math.max(min, Math.round(dailyMax));
  const supabase = await createClient();
  const { error } = await supabase
    .from("outreach_send_limits")
    .upsert({ channel, daily_min: min, daily_max: max }, { onConflict: "workspace_id,channel" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

/** Removes the daily limit for a channel — sending goes back to unthrottled. */
export async function clearSendLimit(channel: SendChannel): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Forbidden" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("outreach_send_limits").delete().eq("channel", channel);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
