// Pure, framework-free rules for the platform-wide feature kill switches
// (Launch Campaign / Send Email / Send Newsletter). Deliberately has NO
// Supabase/Next.js imports — see feature-kill-switches.ts for the DB-backed
// wrapper — so this file's logic can be unit-tested directly with plain
// `node --test` (scripts/test-feature-kill-switches.mjs), the same way
// src/lib/ai/planner/planner.ts is tested.

export type KillSwitchFeature = "launch_campaign" | "send_email" | "send_newsletter" | "verified_emails_source";

export const ALL_KILL_SWITCH_FEATURES: KillSwitchFeature[] = ["launch_campaign", "send_email", "send_newsletter", "verified_emails_source"];

export const FEATURE_LABELS: Record<KillSwitchFeature, string> = {
  launch_campaign: "Campaign launches",
  send_email: "Sending email",
  send_newsletter: "Sending newsletters",
  verified_emails_source: "Verified Emails lead source",
};

/** Features that ship LOCKED by default (a not-yet-released preview an admin
 *  opts into), as opposed to the other kill switches which ship ENABLED by
 *  default (an incident-response pause on something already live). */
export const DEFAULT_LOCKED_FEATURES: KillSwitchFeature[] = ["verified_emails_source"];

/**
 * The admin-bypass rule: the platform admin (admin@nxelio.com) can always
 * use a feature themselves, even while it's switched off for every other
 * user. Extracted as a pure function so it's unit-testable without a live
 * Supabase connection.
 */
export function resolveEffectiveEnabled(isAdmin: boolean, rawEnabled: boolean): boolean {
  return isAdmin || rawEnabled;
}
