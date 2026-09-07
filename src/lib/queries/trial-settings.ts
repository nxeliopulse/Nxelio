"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/queries/platform-admin";
import { revalidatePath } from "next/cache";
import {
  TRIAL_DAYS_DEFAULT,
  TRIAL_USER_LIMIT,
  validateTrialDays,
  type TrialUserUsage,
} from "@/lib/trial-rules";

/**
 * The configured trial length, straight from the DB via the service-role
 * client — safe to call from ANY context (a logged-in admin, a Stripe
 * checkout request, a cron job with no session at all), same contract as
 * getFeatureKillSwitches().
 *
 * Falls back to TRIAL_DAYS_DEFAULT if the row can't be read. A transient DB
 * hiccup must never block a signup or a checkout, and must never hand out an
 * unbounded trial — so the failure mode is "shortest legal trial", not
 * "throw" and not "no trial".
 */
export async function getTrialDays(): Promise<number> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("platform_trial_settings")
      .select("trial_days")
      .eq("id", true)
      .maybeSingle();
    const parsed = validateTrialDays(data?.trial_days);
    return parsed.ok ? parsed.value! : TRIAL_DAYS_DEFAULT;
  } catch {
    return TRIAL_DAYS_DEFAULT;
  }
}

export interface SetTrialDaysResult {
  ok: boolean;
  error?: string;
  /** The value now stored, echoed back so the UI doesn't have to guess. */
  trialDays?: number;
}

/**
 * Updates the platform-wide trial period. Platform admin only.
 *
 * Applies to NEW trials only, by design: the signup trigger and the Stripe
 * checkout both read this value at the moment a trial starts, and nothing
 * here rewrites subscriptions.trial_ends_at. A customer already mid-trial
 * keeps the end date they were promised.
 */
export async function setTrialDays(input: unknown): Promise<SetTrialDaysResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };

  const parsed = validateTrialDays(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const trialDays = parsed.value!;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  // Upsert rather than update: the row is seeded by 0160, but an upsert means
  // a fresh database that somehow skipped the seed still saves correctly
  // instead of silently reporting success against zero affected rows.
  const { error } = await admin
    .from("platform_trial_settings")
    .upsert(
      {
        id: true,
        trial_days: trialDays,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true, trialDays };
}

/**
 * Live trial-seat usage for the CALLER's workspace, for both the "2 of 3
 * users used" display and the invite-time block.
 *
 * `used` is a live count of workspace_members, so deleting a member frees a
 * slot immediately — there is no separate "ever created" counter. The cap
 * applies only while status = 'trialing'; an expired or converted account
 * returns limit: null and is governed by its plan instead.
 */
export async function getTrialUserUsage(): Promise<TrialUserUsage> {
  const fallback: TrialUserUsage = { used: 0, limit: null, isTrialing: false };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fallback;

    const admin = createAdminClient();
    const { data: me } = await admin
      .from("users")
      .select("workspace_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const workspaceId = me?.workspace_id as string | undefined;
    if (!workspaceId) return fallback;

    return await getTrialUserUsageForWorkspace(workspaceId);
  } catch {
    // A failed read must not block the team page from rendering. Reporting
    // "not trialing" here only ever loosens the display; inviteUser does its
    // own check against the same helper before it creates anything.
    return fallback;
  }
}

/**
 * The workspace-scoped half of the above, split out so inviteUser can call it
 * with the workspace it has already resolved and authorised, instead of
 * re-deriving it from the session.
 */
export async function getTrialUserUsageForWorkspace(
  workspaceId: string
): Promise<TrialUserUsage> {
  const admin = createAdminClient();

  const [{ data: sub }, { count }] = await Promise.all([
    admin
      .from("subscriptions")
      .select("status")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    admin
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
  ]);

  const isTrialing = sub?.status === "trialing";
  return {
    used: count ?? 0,
    limit: isTrialing ? TRIAL_USER_LIMIT : null,
    isTrialing,
  };
}
