import crypto from "crypto";

/**
 * Constant-time webhook secret check. FAILS CLOSED: returns false when the
 * configured secret is missing/empty (so an unset env can't leave the endpoint
 * open) or when the provided value doesn't match. Use for inbound webhooks.
 */
export function webhookSecretValid(provided: string | null | undefined, configured: string | undefined): boolean {
  if (!configured) return false;
  const a = Buffer.from(provided || "");
  const b = Buffer.from(configured);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
