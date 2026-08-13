"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/queries/platform-admin";
import { revalidatePath } from "next/cache";
import { ALL_KILL_SWITCH_FEATURES, FEATURE_LABELS, resolveEffectiveEnabled, type KillSwitchFeature } from "@/lib/kill-switch-rules";

/**
 * Raw flags straight from the DB via the service-role admin client — safe to
 * call from ANY context (a real user session, a cron job with no session at
 * all). No admin-bypass logic here; that only makes sense where there's an
 * actual "current user" to bypass for (see isFeatureEnabledForCurrentUser).
 *
 * Fails OPEN (defaults every flag to enabled) if the table can't be read —
 * a transient DB hiccup should never silently take down all outbound
 * sending platform-wide; only an explicit `enabled = false` row blocks
 * anything. Mirrors ai-provider-settings.ts's same fail-open convention.
 */
export async function getFeatureKillSwitches(): Promise<Record<KillSwitchFeature, boolean>> {
  const result: Record<KillSwitchFeature, boolean> = { launch_campaign: true, send_email: true, send_newsletter: true };
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("feature_kill_switches").select("feature_key, enabled");
    for (const row of data || []) {
      if (ALL_KILL_SWITCH_FEATURES.includes(row.feature_key as KillSwitchFeature)) {
        result[row.feature_key as KillSwitchFeature] = Boolean(row.enabled);
      }
    }
  } catch {
    // fall through to the all-enabled default above
  }
  return result;
}

/**
 * For an interactive, logged-in-user action (a real button click). The
 * platform admin bypasses; everyone else gets the real flag. Use this for
 * the Launch/Send buttons and the server actions their submit calls.
 */
export async function isFeatureEnabledForCurrentUser(feature: KillSwitchFeature): Promise<boolean> {
  const [admin, flags] = await Promise.all([isPlatformAdmin(), getFeatureKillSwitches()]);
  return resolveEffectiveEnabled(admin, flags[feature]);
}

/** Throws a clear, user-facing error if disabled (and the caller isn't the
 *  platform admin) — call as the first line of every send-triggering,
 *  user-session server action. */
export async function assertFeatureEnabled(feature: KillSwitchFeature): Promise<void> {
  if (!(await isFeatureEnabledForCurrentUser(feature))) {
    throw new Error(`${FEATURE_LABELS[feature]} have been temporarily disabled by the administrator.`);
  }
}

/**
 * For background/cron paths with NO current user to bypass for. A disabled
 * switch stops ALL sending through this path, including sequence steps that
 * were already launched before the switch flipped off — there's no "admin
 * clicked this" moment in a cron tick, so bypassing here would defeat the
 * whole point of a kill switch (it could never actually stop an in-flight
 * campaign).
 */
export async function isFeatureEnabledForSystem(feature: KillSwitchFeature): Promise<boolean> {
  const flags = await getFeatureKillSwitches();
  return flags[feature];
}

/**
 * Re-verifies the CURRENT platform admin's real password via a throwaway
 * supabase.auth.signInWithPassword() call. The request already has a valid
 * session — this call's own resulting session/tokens are simply discarded;
 * we only care about whether the credentials were accepted. No such
 * re-authentication flow exists anywhere else in the app yet.
 */
export async function verifyPlatformAdminPassword(password: string): Promise<boolean> {
  if (!(await isPlatformAdmin())) return false;
  if (!password) return false;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return false;
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
  return !error;
}

export async function setFeatureKillSwitch(
  feature: KillSwitchFeature,
  enabled: boolean,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };
  if (!(await verifyPlatformAdminPassword(password))) return { ok: false, error: "Incorrect password." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();
  const { error } = await admin
    .from("feature_kill_switches")
    .update({ enabled, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("feature_key", feature);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}
