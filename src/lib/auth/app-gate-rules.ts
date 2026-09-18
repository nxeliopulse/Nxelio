/**
 * Which gate (if any) the app layout should show, as pure logic.
 *
 * Framework-free and dependency-free on purpose — same reasoning as
 * idle-timeout-rules.ts and kill-switch-rules.ts: this decides whether a user
 * reaches the product, sees onboarding, or sees pricing, and that is worth
 * being able to test directly with plain `node --test` rather than only by
 * signing in as four different kinds of user.
 *
 * The intended signup flow is:
 *
 *   signup → onboarding → pricing → Stripe card → 7-day trial → app
 *
 * The subtlety is that "show pricing" has two very different causes, and they
 * want opposite orderings against onboarding:
 *
 *   - NEVER SUBSCRIBED: a new signup partway through the flow above.
 *     Onboarding comes first; pricing is the step after it.
 *   - CANCELLED: a workspace that already completed signup once and lapsed.
 *     Pricing comes first, even if onboarding looks incomplete, or the user
 *     is parked on an onboarding gate they have no reason to finish.
 *
 * Collapsing those two into one `!subscription || cancelled` condition — which
 * is what the layout did — puts the pricing page in front of onboarding for
 * every brand-new user.
 */

export type AppGate =
  /** Subscription exists but is cancelled — pricing, ahead of onboarding. */
  | "cancelled-subscription"
  /** Onboarding not finished and nothing cancelled — onboarding. */
  | "onboarding"
  /** Onboarded, but no subscription row yet — pricing (step 3 of signup). */
  | "no-subscription"
  /** Nothing blocking — render the app. */
  | "allow";

export interface AppGateInput {
  /** The subscription row's status, or null/undefined when there is no row.
   *  Note that callers currently cannot distinguish "no row" from "the lookup
   *  failed" — both arrive here as null. */
  subscriptionStatus: string | null | undefined;
  /** Whether a subscription row exists at all. */
  hasSubscription: boolean;
  /** Whether the stricter 3-part onboarding definition is satisfied. */
  onboardingCompleted: boolean;
}

export function resolveAppGate({
  subscriptionStatus,
  hasSubscription,
  onboardingCompleted,
}: AppGateInput): AppGate {
  if (hasSubscription && subscriptionStatus === "canceled") return "cancelled-subscription";
  if (!onboardingCompleted) return "onboarding";
  if (!hasSubscription) return "no-subscription";
  return "allow";
}
