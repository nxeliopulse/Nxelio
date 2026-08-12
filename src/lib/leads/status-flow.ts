/**
 * Single source of truth for the Lead status state machine — replaces three
 * previously-inconsistent hardcoded lists (edit-lead-modal.tsx's fallback,
 * lead-detail-view.tsx's dropdown, and its separate pipeline-stepper map).
 *
 * Business rules (confirmed with the user):
 *  - "Converted" is never a manual dropdown choice — it's set ONLY by the
 *    Convert flow (lead-conversion.ts), which builds the Account/Contact/
 *    Opportunity records. Manually typing/selecting "Converted" would mark
 *    the lead as converted without ever creating those records.
 *  - "Win"/"Lost" are NOT lead statuses at all — they live on the Opportunity
 *    record instead, once a lead has been converted.
 *  - Converted is a dead end: once set, nothing can manually move a lead's
 *    status away from it.
 */
export const LEAD_STATUSES = ["New", "Contacted", "Qualified", "Nurturing", "Converted"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Manually-reachable next statuses, keyed by current status. "Converted" is
 *  deliberately absent as a value anywhere here — see module doc above. */
const MANUAL_TRANSITIONS: Record<string, string[]> = {
  New: ["Contacted", "Nurturing"],
  Contacted: ["Qualified", "Nurturing"],
  Qualified: ["Nurturing"],
  Nurturing: ["Contacted", "Qualified"],
  Converted: [], // dead end — no manual transition out
};

/** The statuses selectable from `current`, for building a dropdown — always
 *  excludes "Converted" as a destination, and excludes `current` itself
 *  (callers that need the current value shown too should add it separately).
 *  Falls back to allowing any of the four manual statuses for a `current`
 *  value this table doesn't recognize (e.g. legacy data), rather than
 *  bricking a lead's status entirely over an unrecognized value. */
export function allowedNextStatuses(current: string): string[] {
  const known = MANUAL_TRANSITIONS[current];
  if (known) return known;
  return ["New", "Contacted", "Qualified", "Nurturing"];
}

/**
 * Whether a MANUAL status change (dropdown, not the Convert button) from
 * `current` to `next` is allowed. Always false for `next === "Converted"` —
 * that value may only be set by lead-conversion.ts's convertLead().
 */
export function isManualStatusTransitionAllowed(current: string, next: string): boolean {
  if (next === current) return true; // no-op
  if (next === "Converted") return false;
  return allowedNextStatuses(current).includes(next);
}

/** Human-readable reason a blocked transition was rejected, for error messages. */
export function statusTransitionError(current: string, next: string): string {
  if (next === "Converted") {
    return 'Status can\'t be set to "Converted" manually — use the Convert button instead, which creates the Account, Contact, and Opportunity records.';
  }
  const allowed = allowedNextStatuses(current);
  return allowed.length
    ? `"${current}" can only move to ${allowed.join(" or ")}.`
    : `"${current}" is a final status and can't be changed manually.`;
}
