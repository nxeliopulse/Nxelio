// Idle-session-timeout config — server/edge-only. Deliberately no directive
// (not "use server"/"use client"): only ever imported from middleware.ts and
// the (app) server layout. Plain (non-NEXT_PUBLIC_) env vars aren't available
// in the browser bundle, so the resolved numbers are passed down to the
// client IdleTimeoutProvider as props rather than read again client-side.

const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;
const DEFAULT_WARNING_LEAD_MINUTES = 2;

export function getIdleTimeoutMinutes(): number {
  const n = Number(process.env.IDLE_TIMEOUT_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_TIMEOUT_MINUTES;
}

export function getWarningLeadMinutes(): number {
  const n = Number(process.env.IDLE_TIMEOUT_WARNING_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WARNING_LEAD_MINUTES;
}

/** Cookie name shared between middleware.ts (writer/enforcer) and any
 *  server code that needs to know it — kept in one place so it can't drift. */
export const IDLE_ACTIVITY_COOKIE = "idle_last_activity";
