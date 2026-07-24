import Nylas from "nylas";

/**
 * Nylas singleton client (server-only). Lazily created so build-time imports
 * don't blow up when NYLAS_API_KEY isn't set — same pattern as stripe.ts.
 */
let _client: Nylas | null = null;

export function nylas(): Nylas {
  if (!_client) {
    const apiKey = process.env.NYLAS_API_KEY;
    if (!apiKey) throw new Error("Missing NYLAS_API_KEY env var");
    _client = new Nylas({ apiKey });
  }
  return _client;
}

export const nylasConfigured = Boolean(process.env.NYLAS_API_KEY);
