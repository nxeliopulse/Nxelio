// Shared trial constants and pure validation. NO "use server" directive, so
// this can be imported from client components (the Admin field, the invite
// modal) as well as from server actions — same split as
// subscription-types.ts and kill-switch-rules.ts.

/** Inclusive bounds an admin may set the trial period to. Mirrored by a
 *  CHECK constraint on platform_trial_settings (see 0160) so the database
 *  rejects an out-of-range value even if it arrives from outside the app. */
export const TRIAL_DAYS_MIN = 15;
export const TRIAL_DAYS_MAX = 30;

/** Used when the settings row can't be read. Deliberately the low end of the
 *  range: if the platform can't tell how long a trial should be, err toward
 *  the shorter one rather than handing out a free month. */
export const TRIAL_DAYS_DEFAULT = 15;

/** Total members a workspace may have while status = 'trialing', INCLUDING
 *  the Super Admin who created the account. So the owner plus two invites.
 *  Counted live off workspace_members, so deleting a member frees a slot. */
export const TRIAL_USER_LIMIT = 3;

export const TRIAL_USER_LIMIT_MESSAGE =
  `Trial accounts are limited to ${TRIAL_USER_LIMIT} users. Upgrade to add more.`;

export interface TrialDaysValidation {
  ok: boolean;
  /** Present only when ok is false. Written for the admin to read as-is. */
  error?: string;
  /** The coerced integer, present only when ok is true. */
  value?: number;
}

/**
 * The single definition of "is this a legal trial period". Rejects blanks,
 * non-numbers and fractions before the range check, so "20.5" fails with a
 * message about whole days rather than silently truncating to 20.
 */
export function validateTrialDays(input: unknown): TrialDaysValidation {
  const raw = typeof input === "string" ? input.trim() : input;
  if (raw === "" || raw === null || raw === undefined) {
    return { ok: false, error: "Enter a trial period." };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return { ok: false, error: "Trial period must be a number." };
  }
  if (!Number.isInteger(n)) {
    return { ok: false, error: "Trial period must be a whole number of days." };
  }
  if (n < TRIAL_DAYS_MIN || n > TRIAL_DAYS_MAX) {
    return {
      ok: false,
      error: `Trial period must be between ${TRIAL_DAYS_MIN} and ${TRIAL_DAYS_MAX} days.`,
    };
  }
  return { ok: true, value: n };
}

export interface TrialUserUsage {
  /** Members in the workspace right now. */
  used: number;
  /** TRIAL_USER_LIMIT while trialing; null once the account is on a paid
   *  plan, where the trial cap no longer applies at all. */
  limit: number | null;
  /** True only for status = 'trialing'. An expired or converted account is
   *  not "in trial" and is not subject to the cap. */
  isTrialing: boolean;
}

/** Whether one more member can be added. A non-trialing account is never
 *  blocked by this rule — plan-based limits govern there instead. */
export function canAddTrialUser(usage: TrialUserUsage): boolean {
  if (!usage.isTrialing || usage.limit === null) return true;
  return usage.used < usage.limit;
}
