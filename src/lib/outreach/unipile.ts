import "server-only";

/**
 * Unipile client — one provider for BOTH Gmail/Outlook email and LinkedIn.
 *
 * Setup (see docs/OUTREACH_SETUP.md):
 *   UNIPILE_DSN      e.g. https://api8.unipile.com:13851   (from your Unipile dashboard)
 *   UNIPILE_API_KEY  your API access token
 *
 * If these are unset, `unipileConfigured` is false and callers fall back
 * (email → Brevo, LinkedIn → logged-only), so the app keeps working.
 */
const DSN = process.env.UNIPILE_DSN;
const API_KEY = process.env.UNIPILE_API_KEY;

export const unipileConfigured = Boolean(DSN && API_KEY);

function baseUrl() {
  if (!DSN) throw new Error("Unipile not configured (missing UNIPILE_DSN)");
  return DSN.replace(/\/+$/, "") + "/api/v1";
}

async function unipileFetch(path: string, init: RequestInit = {}) {
  if (!unipileConfigured) throw new Error("Unipile not configured");
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "X-API-KEY": API_KEY!,
      "Content-Type": "application/json",
      accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    // Unipile returns { status, type, title, detail } — surface detail/title so
    // failures are human-readable in the activity log (not just "HTTP 500").
    let msg = `HTTP ${res.status}`;
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      msg = String(d.detail || d.title || d.message || msg);
    } else if (typeof data === "string" && data) {
      msg = data;
    }
    throw new Error(`Unipile (${res.status}): ${msg.slice(0, 300)}`);
  }
  return data;
}

export interface UnipileAccount {
  id: string;
  type: string;            // "MAIL" | "LINKEDIN" | ...
  name?: string;
  identifier?: string;     // email or linkedin handle
  status?: string;
}

/**
 * Creates a Unipile-hosted auth wizard link. The user clicks it, authorizes
 * their Gmail/Outlook or LinkedIn, and Unipile redirects back to `successUrl`.
 * We then sync accounts to pick up the newly connected one.
 */
export async function createHostedAuthLink(opts: {
  providers: "email" | "linkedin";
  successUrl: string;
  failureUrl: string;
  name: string; // our correlation id (workspace id)
  expiresOn: string; // ISO timestamp
}): Promise<{ url: string }> {
  const providerMap = { email: ["GOOGLE", "OUTLOOK", "MAIL"], linkedin: ["LINKEDIN"] };
  const data = await unipileFetch("/hosted/accounts/link", {
    method: "POST",
    body: JSON.stringify({
      type: "create",
      providers: providerMap[opts.providers],
      api_url: baseUrl().replace(/\/api\/v1$/, ""),
      expiresOn: opts.expiresOn,
      success_redirect_url: opts.successUrl,
      failure_redirect_url: opts.failureUrl,
      name: opts.name,
    }),
  });
  const url = (data as { url?: string })?.url;
  if (!url) throw new Error("Unipile did not return a hosted auth url");
  return { url };
}

/** Lists all accounts connected to this Unipile workspace. */
export async function listUnipileAccounts(): Promise<UnipileAccount[]> {
  const data = await unipileFetch("/accounts", { method: "GET" });
  const items = (data as { items?: unknown[] })?.items ?? [];
  return items.map((a) => {
    const acc = a as Record<string, unknown>;
    return {
      id: String(acc.id ?? ""),
      type: String(acc.type ?? ""),
      name: acc.name ? String(acc.name) : undefined,
      identifier: acc.identifier ? String(acc.identifier) : undefined,
      status: acc.status ? String(acc.status) : undefined,
    };
  });
}

/** Disconnects (deletes) an account from Unipile so it won't be re-synced. */
export async function unipileDeleteAccount(accountId: string): Promise<void> {
  await unipileFetch(`/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
}

/** Fetches a single account's current state — used to poll a WhatsApp
 *  connection past its QR/pairing-code checkpoint to "OK" (connected). */
export async function getUnipileAccount(accountId: string): Promise<Record<string, unknown>> {
  const data = await unipileFetch(`/accounts/${encodeURIComponent(accountId)}`, { method: "GET" });
  return (data as Record<string, unknown>) ?? {};
}

export interface WhatsAppConnectResult {
  accountId: string;
  /** "connected" once past the checkpoint, "pending" while a QR/code needs scanning/entering. */
  status: "connected" | "pending";
  qrCode?: string;      // data:image/... or base64 — field name unconfirmed by Unipile's docs, extracted defensively
  pairingCode?: string; // short code to type into WhatsApp when a phone number was supplied
  raw: Record<string, unknown>;
}

/**
 * Connects a WhatsApp Business number via Unipile's native pairing flow (NOT
 * the hosted-auth-link flow used for email/LinkedIn). If `pairingPhoneNumber`
 * is given (E.164, e.g. "+15551234567") Unipile returns a short pairing code
 * to type into WhatsApp; otherwise it returns a QR code to scan. Unipile's
 * public docs don't pin down the exact checkpoint field names, so this reads
 * several plausible field names defensively and keeps `raw` for debugging.
 */
export async function createWhatsAppAccount(pairingPhoneNumber?: string): Promise<WhatsAppConnectResult> {
  const data = (await unipileFetch("/accounts", {
    method: "POST",
    body: JSON.stringify({
      provider: "WHATSAPP",
      ...(pairingPhoneNumber ? { pairing_phone_number: pairingPhoneNumber } : {}),
    }),
  })) as Record<string, unknown>;

  const accountId = String(data.account_id ?? data.id ?? "");
  const checkpoint = (data.checkpoint as Record<string, unknown> | undefined) ?? data;
  const qrCode =
    (checkpoint.qrcode as string) ||
    (checkpoint.qr_code as string) ||
    (checkpoint.qrCode as string) ||
    (data.qrcode as string) ||
    (data.qr_code as string) ||
    undefined;
  const pairingCode =
    (checkpoint.pairing_code as string) ||
    (checkpoint.pairingCode as string) ||
    (checkpoint.code as string) ||
    (data.pairing_code as string) ||
    undefined;
  const object = String(data.object ?? "");

  return {
    accountId,
    status: object === "AccountCreated" && !qrCode && !pairingCode ? "connected" : "pending",
    qrCode,
    pairingCode,
    raw: data,
  };
}

/** Sends a WhatsApp message from a connected number to a lead's phone. */
export async function unipileSendWhatsAppMessage(opts: {
  accountId: string;
  phone: string; // E.164, e.g. "+15551234567"
  text: string;
}): Promise<{ id?: string }> {
  const attendeeId = opts.phone.replace(/[^\d]/g, "");
  const data = await unipileFetch("/chats", {
    method: "POST",
    body: JSON.stringify({
      account_id: opts.accountId,
      attendees_ids: [attendeeId],
      text: opts.text,
    }),
  });
  return { id: (data as { id?: string })?.id };
}

/** Sends an email from a connected mailbox. */
export async function unipileSendEmail(opts: {
  accountId: string;
  to: string;
  subject: string;
  body: string; // HTML or text
}): Promise<{ id?: string }> {
  const data = await unipileFetch("/emails", {
    method: "POST",
    body: JSON.stringify({
      account_id: opts.accountId,
      to: [{ identifier: opts.to }],
      subject: opts.subject,
      body: opts.body,
    }),
  });
  return { id: (data as { id?: string })?.id };
}

/** Sends a LinkedIn connection (invitation) request, with optional note. */
export async function unipileSendInvite(opts: {
  accountId: string;
  providerId: string; // recipient's LinkedIn provider id (resolved from profile)
  message?: string;
}): Promise<{ id?: string }> {
  const data = await unipileFetch("/users/invite", {
    method: "POST",
    body: JSON.stringify({
      account_id: opts.accountId,
      provider_id: opts.providerId,
      message: opts.message || undefined,
    }),
  });
  return { id: (data as { id?: string })?.id };
}

/** Sends a LinkedIn direct message (requires being connected / open profile). */
export async function unipileSendLinkedInMessage(opts: {
  accountId: string;
  providerId: string;
  text: string;
}): Promise<{ id?: string }> {
  const data = await unipileFetch("/chats", {
    method: "POST",
    body: JSON.stringify({
      account_id: opts.accountId,
      attendees_ids: [opts.providerId],
      text: opts.text,
    }),
  });
  return { id: (data as { id?: string })?.id };
}

// ---------------------------------------------------------------------------
// Lead collection — LinkedIn search + post engagers
// ---------------------------------------------------------------------------
export interface UnipileProfile {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  location: string | null;
  profileUrl: string | null;
  identifier: string | null;
}

interface SearchItem {
  name?: string; first_name?: string; last_name?: string;
  headline?: string; location?: string;
  public_profile_url?: string; public_identifier?: string;
  // Post reaction/comment authors use these field names instead:
  profile_url?: string; id?: string;
}

function mapProfile(it: SearchItem): UnipileProfile {
  const identifier = it.public_identifier || null;
  // Engager authors expose `profile_url` (often an ACoAA…-style URL); search results
  // expose `public_profile_url` / `public_identifier`. Accept whichever is present.
  const url = it.public_profile_url || it.profile_url || (identifier ? `https://www.linkedin.com/in/${identifier}` : null);
  return {
    name: it.name || [it.first_name, it.last_name].filter(Boolean).join(" ") || null,
    firstName: it.first_name || null,
    lastName: it.last_name || null,
    headline: it.headline || null,
    location: it.location || null,
    profileUrl: url,
    identifier,
  };
}

/**
 * Runs a LinkedIn people search on the connected account (from a LinkedIn /
 * Sales Navigator search URL) and returns up to `limit` profiles, paginating
 * via the cursor. Respects LinkedIn's rate limits on Unipile's side.
 */
/**
 * Unipile's LinkedIn search only accepts a PEOPLE search URL. Normalize whatever
 * the user pastes — the "all results" page (/search/results/all/) or a typeahead
 * URL — into /search/results/people/ and drop nav-only junk params.
 */
export function normalizeLinkedInSearchUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.pathname = u.pathname.replace(/\/search\/results\/[^/]+/i, "/search/results/people");
    if (!/\/search\/results\/people/i.test(u.pathname)) {
      // e.g. a Sales Navigator or bare URL — append the people results path
      u.pathname = "/search/results/people/";
    }
    u.searchParams.delete("origin");
    u.searchParams.delete("position");
    return u.toString();
  } catch {
    return raw;
  }
}

export async function unipileLinkedInSearch(opts: {
  accountId: string;
  url: string;
  limit?: number;
}): Promise<{ profiles: UnipileProfile[] }> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const searchUrl = normalizeLinkedInSearchUrl(opts.url);
  const profiles: UnipileProfile[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 10 && profiles.length < limit; page++) {
    const qs = `account_id=${encodeURIComponent(opts.accountId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const data = (await unipileFetch(`/linkedin/search?${qs}`, {
      method: "POST",
      body: JSON.stringify({ url: searchUrl }),
    })) as { items?: SearchItem[]; cursor?: string };
    const items = data.items || [];
    for (const it of items) profiles.push(mapProfile(it));
    cursor = data.cursor;
    if (!cursor || items.length === 0) break;
  }
  return { profiles: profiles.slice(0, limit) };
}

/** Turns a LinkedIn post URL into the activity social id Unipile expects. */
export function postUrlToSocialId(url: string): string | null {
  const u = url.trim();
  let m = u.match(/activity[:-](\d{15,25})/);
  if (m) return `urn:li:activity:${m[1]}`;
  m = u.match(/ugcPost[:-](\d{15,25})/i);
  if (m) return `urn:li:ugcPost:${m[1]}`;
  m = u.match(/share[:-](\d{15,25})/i);
  if (m) return `urn:li:share:${m[1]}`;
  m = u.match(/(\d{15,25})/); // bare numeric id fallback
  return m ? `urn:li:activity:${m[1]}` : null;
}

/**
 * Returns people who reacted to and/or commented on a LinkedIn post.
 * Pulls up to `limit`, deduped by profile identifier.
 */
export async function unipilePostEngagers(opts: {
  accountId: string;
  postUrl: string;
  limit?: number;
}): Promise<{ profiles: UnipileProfile[] }> {
  const parsed = postUrlToSocialId(opts.postUrl);
  if (!parsed) return { profiles: [] };

  // A post URL carries an `activity` id, but reactions/comments live under the
  // post's REAL social_id (often a different `ugcPost` id for reshares). Resolve
  // it by fetching the post first; fall back to the parsed urn if that fails.
  let socialId: string = parsed;
  const numericId = parsed.match(/(\d{15,25})/)?.[1];
  if (numericId) {
    try {
      const post = await unipileFetch(`/posts/${numericId}?account_id=${encodeURIComponent(opts.accountId)}`, { method: "GET" });
      const real = (post as { social_id?: string })?.social_id;
      if (real) socialId = real;
    } catch { /* keep the parsed urn */ }
  }

  const limit = Math.min(opts.limit ?? 50, 200);
  const seen = new Set<string>();
  const profiles: UnipileProfile[] = [];

  async function pull(kind: "reactions" | "comments") {
    let cursor: string | undefined;
    for (let page = 0; page < 8 && profiles.length < limit; page++) {
      const qs = `account_id=${encodeURIComponent(opts.accountId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const data = (await unipileFetch(`/posts/${encodeURIComponent(socialId)}/${kind}?${qs}`, { method: "GET" })) as { items?: Record<string, SearchItem>[]; cursor?: string };
      const items = data.items || [];
      for (const raw of items) {
        // engager profile may be nested under author/actor/user depending on kind
        const it = (raw.author || raw.actor || raw.user || raw) as SearchItem;
        const id = it.public_identifier || it.profile_url || it.public_profile_url || it.id || it.name || "";
        if (!id || seen.has(id)) continue;
        seen.add(id);
        profiles.push(mapProfile(it));
      }
      cursor = data.cursor;
      if (!cursor || items.length === 0) break;
    }
  }

  let firstErr: unknown = null;
  try { await pull("reactions"); } catch (e) { firstErr = e; }
  try { if (profiles.length < limit) await pull("comments"); } catch (e) { if (!firstErr) firstErr = e; }
  // If we got nothing AND something errored, surface the real reason (e.g. a dead
  // account) so the import can report it / try another account — don't hide it as "0".
  if (profiles.length === 0 && firstErr) throw firstErr;
  return { profiles: profiles.slice(0, limit) };
}

/** True when the profile's `network_distance` means we're already 1st-degree
 *  connected (or it's our own profile) — i.e. sending an invite would be a no-op. */
export function isAlreadyLinkedInConnection(networkDistance: string | null): boolean {
  return networkDistance === "DISTANCE_1" || networkDistance === "SELF";
}

/** Resolves a LinkedIn profile (from a public URL) to its provider id, plus
 *  the account's current relationship to that profile (`network_distance`:
 *  "SELF" | "DISTANCE_1" (1st-degree/connected) | "DISTANCE_2" | "DISTANCE_3"
 *  | "OUT_OF_NETWORK") so callers can decide invite-vs-message BEFORE sending. */
export async function unipileResolveProfile(opts: {
  accountId: string;
  identifier: string; // public LinkedIn url or handle
}): Promise<{ providerId: string | null; networkDistance: string | null; error: string | null }> {
  const handle = opts.identifier.replace(/\/+$/, "").split("/in/").pop()?.split(/[/?]/)[0] || opts.identifier;
  try {
    const data = await unipileFetch(`/users/${encodeURIComponent(handle)}?account_id=${encodeURIComponent(opts.accountId)}`, { method: "GET" });
    const d = data as { provider_id?: string; network_distance?: string };
    const pid = d?.provider_id;
    return { providerId: pid ? String(pid) : null, networkDistance: d?.network_distance ? String(d.network_distance) : null, error: null };
  } catch (err) {
    // Surface the real Unipile response (rate limit / expired session / bad
    // handle / outage) instead of hiding it behind a generic "not found".
    return { providerId: null, networkDistance: null, error: err instanceof Error ? err.message : "Unipile profile lookup failed" };
  }
}
