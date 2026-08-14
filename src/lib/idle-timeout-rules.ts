// Pure, framework-free logic for the idle-session-timeout Proxy check.
// Deliberately has NO next/server or @supabase/ssr imports — src/proxy.ts
// imports these from here rather than defining them inline, so this file's
// logic can be unit-tested directly with plain `node --test`
// (scripts/test-idle-timeout.mjs), the same way src/lib/kill-switch-rules.ts
// is tested. Importing src/proxy.ts itself into a plain Node script would
// pull in next/server/@supabase/ssr and fail outside the Next.js build.

// Paths with no authenticated app session — the idle-timeout check skips
// these. Separate from (and broader than) proxy.ts's own isAppPage
// allowlist, which only gates the login/dashboard redirect and predates
// several newer sections (accounts, contacts, opportunities, etc.) — reusing
// its gaps here would leave those pages unprotected by the idle timeout.
export const PUBLIC_PATH_PREFIXES = [
  "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/check-email",
  "/auth", "/privacy", "/terms", "/capture", "/book", "/checkout-return",
  "/admin", "/api",
];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** True once `now` is far enough past `lastActivity` to exceed `idleLimitMs`.
 *  `lastActivity === null` (no cookie yet — a fresh session) is never expired. */
export function isIdleExpired(lastActivity: number | null, now: number, idleLimitMs: number): boolean {
  if (lastActivity === null || !Number.isFinite(lastActivity)) return false;
  return now - lastActivity > idleLimitMs;
}
