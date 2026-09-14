/**
 * The platform admin identity, as a plain synchronous check.
 *
 * This lives outside platform-admin.ts because that file is "use server" and
 * may therefore only export async functions — which is why the constant was
 * previously unexported, and why every caller had to go through
 * isPlatformAdmin(), an async call that re-fetches the session over the
 * network just to compare one string.
 *
 * Callers that already hold the session user (the app layout does — it fetched
 * the user on the line above) can use this directly and skip that round-trip.
 * Callers that do not still use isPlatformAdmin(), which now reads the same
 * constant from here, so there remains exactly one definition of who the
 * platform admin is.
 *
 * Intentionally NOT the same thing as a workspace's in-app Super Admin role.
 */
export const PLATFORM_ADMIN_EMAIL = "admin@nxelio.com";

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase() === PLATFORM_ADMIN_EMAIL);
}
