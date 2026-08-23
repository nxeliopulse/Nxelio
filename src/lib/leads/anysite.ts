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

// ============================================================================
// People search — Anysite's own cached LinkedIn database (~70M records), a
// real alternative to Bright Data's Google-SERP scraping. Confirmed request
// shape against the live API (see AGENTS session notes): POST
// /api/linkedin/search/sql/users, cost reported via the x-token-points
// response header (roughly 1 credit per returned result).
const SEARCH_ENDPOINT = "https://api.anysite.io/api/linkedin/search/sql/users";

export interface AnysiteProspect {
  full_name: string;
  first_name: string;
  last_name: string;
  title: string;
  /** Derived from the real title text, same convention as the Bright Data path — never fabricated. */
  seniority: string;
  company_name: string;
  location: string;
  linkedin: string;
  email: string; // always "" here — filled in afterward via findEmailsByLinkedIn
}

/** Same keyword-matching convention used by the Bright Data path, kept local
 *  to avoid a cross-file dependency between the two provider implementations. */
function estimateSeniority(title: string): string {
  const t = title.toLowerCase();
  if (!t) return "";
  if (/\b(chief|ceo|cto|cfo|coo|cmo|cro|cio|founder|co-founder|president|owner)\b/.test(t)) return "C-Level";
  if (/\b(vp|vice[\s-]president|svp|evp)\b/.test(t)) return "VP";
  if (/\bdirector\b/.test(t)) return "Director";
  if (/\b(manager|head of|team lead|lead\b)/.test(t)) return "Manager";
  return "Individual Contributor";
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}

export interface AnysiteSearchCriteria {
  role?: string;
  locations?: string[];
  count: number;
  /** Restricts to people currently at one of these companies — used by Company-wise Leads. */
  companyNames?: string[];
  /** Anysite has no cursor/offset — instead it partitions ALL matching
   *  results into `bucketTotal` non-overlapping slices, returning slice
   *  `bucketIndex` (0-based). Fixing bucketTotal for a search and stepping
   *  bucketIndex across repeated calls guarantees every call returns
   *  genuinely new people — no re-paying for the same top matches the way
   *  plain count-escalation would. Confirmed via Anysite's API reference. */
  bucketTotal?: number;
  bucketIndex?: number;
}

/**
 * Real people sourcing via Anysite's cached LinkedIn database. Costs roughly
 * 1 credit per result (confirmed via x-token-points header), and is
 * dramatically faster than Bright Data's SERP paging since it's a direct
 * database query instead of scraping Google search result pages.
 */
function mapRows(rows: Array<Record<string, unknown>>): AnysiteProspect[] {
  return rows.map((u) => {
    const exp = Array.isArray(u.experience) ? (u.experience as Array<Record<string, unknown>>) : [];
    const current = exp.find((e) => !e.end_date) || exp[0] || {};
    const company = (current.company as Record<string, unknown>) || {};
    const name = String(u.name || "");
    const { first, last } = splitName(name);
    const title = String(current.position || u.headline || "");
    return {
      full_name: name,
      first_name: String(u.first_name || first),
      last_name: String(u.last_name || last),
      title,
      seniority: estimateSeniority(title),
      company_name: String(company.name || ""),
      location: String(u.location || ""),
      linkedin: String(u.url || ""),
      email: "",
    };
  });
}

/** One search call against a fixed request body — company name (if any) must
 *  be a single string per the live API (confirmed: passing an array 422s),
 *  which is why multi-company search runs one call per company instead. */
async function searchOnce(body: Record<string, unknown>): Promise<{ ok: boolean; prospects: AnysiteProspect[]; error?: string }> {
  try {
    const res = await fetch(SEARCH_ENDPOINT, {
      method: "POST",
      headers: { "access-token": API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = `Anysite (${res.status})`;
      try {
        const parsed = JSON.parse(text);
        detail = parsed?.detail || detail;
      } catch { /* non-JSON error body — keep the generic status message */ }
      return { ok: false, prospects: [], error: detail };
    }
    const rows: Array<Record<string, unknown>> = JSON.parse(text);
    return { ok: true, prospects: mapRows(rows) };
  } catch (e) {
    return { ok: false, prospects: [], error: e instanceof Error ? e.message : "Anysite search failed" };
  }
}

export async function searchAnysiteUsers(criteria: AnysiteSearchCriteria): Promise<{ ok: boolean; prospects: AnysiteProspect[]; error?: string }> {
  if (!API_KEY) return { ok: false, prospects: [], error: "Anysite not configured" };
  const count = Math.max(1, Math.min(1000, Math.round(criteria.count || 10)));
  const baseBody: Record<string, unknown> = { has_current_role: true };
  if (criteria.role) baseBody.current_title = criteria.role;
  const locs = (criteria.locations || []).filter(Boolean);
  if (locs.length) baseBody.location = locs.join(", "); // API expects a single free-text string, not an array
  if (criteria.bucketTotal !== undefined && criteria.bucketIndex !== undefined) {
    baseBody.bucket_total = criteria.bucketTotal;
    baseBody.bucket_index = criteria.bucketIndex;
  }

  const companies = (criteria.companyNames || []).filter(Boolean);
  if (!companies.length) {
    return searchOnce({ ...baseBody, count });
  }

  // current_company_name is a single-string filter on the live API (no OR-of-
  // names support), so search once per company and merge — one real call per
  // company, not per lead, and each is capped so the total never exceeds count.
  const perCompany = Math.max(1, Math.ceil(count / companies.length));
  const seen = new Set<string>();
  const prospects: AnysiteProspect[] = [];
  let lastError: string | undefined;
  for (const name of companies) {
    if (prospects.length >= count) break;
    const r = await searchOnce({ ...baseBody, current_company_name: name, count: perCompany });
    if (!r.ok) { lastError = r.error; continue; }
    for (const p of r.prospects) {
      if (prospects.length >= count) break;
      if (p.linkedin && seen.has(p.linkedin)) continue;
      if (p.linkedin) seen.add(p.linkedin);
      prospects.push(p);
    }
  }
  if (!prospects.length) return { ok: false, prospects: [], error: lastError || "No prospects found." };
  return { ok: true, prospects };
}
