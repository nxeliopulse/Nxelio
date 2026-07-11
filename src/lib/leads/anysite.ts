import "server-only";

// Anysite — LinkedIn Data API. Finds a real email address for a public LinkedIn
// profile URL. Confirmed request shape against the live API (a request missing
// the auth header returns a structured "access-token or user-authorization
// required" validation error naming this exact endpoint/header):
// https://docs.anysite.io — POST /api/linkedin/user/find_email_by_url
const API_KEY = process.env.ANYSITE_API_KEY;
const ENDPOINT = "https://api.anysite.io/api/linkedin/user/find_email_by_url";

export const anysiteConfigured = Boolean(API_KEY);

export interface AnysiteResult {
  ok: boolean;
  email?: string;
  status?: string; // e.g. "valid"
  error?: string;
}

/** Looks up a real email for one LinkedIn profile URL. Returns ok:false (never throws) so a batch of lookups can't be taken down by one bad profile. */
export async function findEmailByLinkedIn(linkedinUrl: string, requestTimeoutSec = 60): Promise<AnysiteResult> {
  if (!API_KEY) return { ok: false, error: "Anysite not configured" };
  const ctrl = new AbortController();
  // Give the fetch a bit more headroom than the scrape timeout we ask Anysite to respect.
  const t = setTimeout(() => ctrl.abort(), (requestTimeoutSec + 15) * 1000);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "access-token": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ url: linkedinUrl, timeout: requestTimeoutSec }),
      signal: ctrl.signal,
    });
    const rawData = await res.json().catch(() => null);
    
    // API may return an array (e.g., [result]) or an object directly
    const data = Array.isArray(rawData) ? rawData[0] : rawData;

    if (!res.ok) {
      const detail = data?.detail;
      const error = typeof detail === "string" ? detail : `Anysite (${res.status})`;
      console.error(`Anysite error for ${linkedinUrl}: ${error}`);
      return { ok: false, error };
    }
    const email = data?.valid_email || data?.email;
    if (!email) {
      console.warn(`Anysite: No email found for ${linkedinUrl}`);
      return { ok: false, error: "No email found" };
    }
    return { ok: true, email, status: data?.email_status };
  } catch (e) {
    console.error(`Anysite exception for ${linkedinUrl}:`, e);
    return { ok: false, error: e instanceof Error ? e.message : "Lookup failed" };
  } finally {
    clearTimeout(t);
  }
}

/** Enriches multiple LinkedIn URLs with emails, capped at a small concurrency so a big batch doesn't fire 25 requests at once. */
export async function findEmailsByLinkedIn(linkedinUrls: string[]): Promise<Map<string, AnysiteResult>> {
  const results = new Map<string, AnysiteResult>();
  const CONCURRENCY = 5;
  for (let i = 0; i < linkedinUrls.length; i += CONCURRENCY) {
    const batch = linkedinUrls.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(batch.map((url) => findEmailByLinkedIn(url)));
    batch.forEach((url, idx) => results.set(url, settled[idx]));
  }
  return results;
}
