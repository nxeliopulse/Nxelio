import "server-only";

// Bright Data Web Unlocker / SERP. We hit the /request endpoint with a Google
// search URL (site:linkedin.com/in ...) and brd_json=1, which returns the parsed
// SERP as JSON. Each organic result is a real LinkedIn profile (the lead).
const API_KEY = process.env.BRIGHTDATA_API_KEY;
const ZONE = process.env.BRIGHTDATA_ZONE || "web_unlocker1";
const ENDPOINT = "https://api.brightdata.com/request";

export const brightDataConfigured = Boolean(API_KEY);

export interface BrightDataProspect {
  full_name: string;
  first_name: string;
  last_name: string;
  title: string;
  /** "C-Level" | "VP" | "Director" | "Manager" | "Individual Contributor" | "" —
   *  a real derivation from the title text this SERP actually returns, not a guess
   *  at data we don't have (this pipeline has no company-size/revenue signal at all). */
  seniority: string;
  company_name: string;
  location: string;
  linkedin: string;
  email: string; // always "" — a SERP source has no email addresses
}

const cut = (s: string | undefined, n: number) => (s || "").trim().slice(0, n);

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}

/** Derives a seniority bucket from a real job title string — never fabricated,
 *  just keyword matching against text the SERP genuinely returned. */
function estimateSeniority(title: string): string {
  const t = title.toLowerCase();
  if (!t) return "";
  if (/\b(chief|ceo|cto|cfo|coo|cmo|cro|cio|founder|co-founder|president|owner)\b/.test(t)) return "C-Level";
  if (/\b(vp|vice[\s-]president|svp|evp)\b/.test(t)) return "VP";
  if (/\bdirector\b/.test(t)) return "Director";
  if (/\b(manager|head of|team lead|lead\b)/.test(t)) return "Manager";
  return "Individual Contributor";
}

/** Retries transient failures (network/5xx) with exponential backoff — does
 *  NOT retry a legitimately empty result, that's a real "no matches" response. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastErr;
}

interface SerpOrganic {
  link?: string;
  title?: string;
  description?: string;
}

/** One page of Google SERP via Bright Data, parsed to organic results. */
async function brightDataSerp(query: string, start: number, timeoutMs: number): Promise<SerpOrganic[]> {
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20&start=${start}&brd_json=1`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY!}`, "Content-Type": "application/json" },
      body: JSON.stringify({ zone: ZONE, url: googleUrl, format: "raw" }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Bright Data (${res.status}): ${(await res.text().catch(() => "")).slice(0, 160)}`);
    const text = await res.text();
    let data: { organic?: SerpOrganic[] };
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Bright Data returned a non-JSON SERP — make sure the zone supports SERP/brd_json.");
    }
    return Array.isArray(data.organic) ? data.organic : [];
  } finally {
    clearTimeout(t);
  }
}

/**
 * Parse a LinkedIn SERP title. Handles two shapes Google actually returns:
 *   "Jane Doe - Marketing Manager - Acme | LinkedIn"   (title, company as separate segments)
 *   "Jane Doe - Marketing Manager at Acme | LinkedIn"  (title and company combined in one segment)
 */
function parseLinkedInTitle(rawTitle: string, fallbackRole: string): { name: string; title: string; company: string } {
  const t = (rawTitle || "").replace(/\s*[|\-–]\s*LinkedIn\s*$/i, "").trim();
  const parts = t.split(/\s+[-–|]\s+/).map((p) => p.trim()).filter(Boolean);
  const name = parts[0] || "N/A";
  let title = parts[1] || fallbackRole || "";
  let company = parts[2] || "";

  // No separate company segment — LinkedIn commonly folds it into the title
  // as "<Title> at <Company>" instead of a dash-delimited part.
  if (!company && title) {
    const atMatch = title.match(/^(.*?)\s+at\s+(.+)$/i);
    if (atMatch) {
      title = atMatch[1].trim();
      company = atMatch[2].trim();
    }
  }

  return { name, title, company };
}

/**
 * Real LinkedIn people sourcing via Bright Data. Builds a Google query for
 * public LinkedIn profile pages and pages through the SERP until it has enough
 * unique profiles. Returns LinkedIn URL + parsed name/title/company (no email —
 * a SERP source can't provide verified emails).
 */
// Query-hint terms for a seniority bucket — biases which SERP results come
// back, but is NOT a guarantee (Google/LinkedIn snippets don't reliably state
// seniority), so results are also post-filtered by the real, derived
// estimateSeniority() below rather than trusted on search bias alone.
const SENIORITY_QUERY_TERMS: Record<string, string> = {
  "C-Level": '("CEO" OR "CTO" OR "CFO" OR "COO" OR "Chief" OR "Founder" OR "President")',
  VP: '("VP" OR "Vice President" OR "SVP" OR "EVP")',
  Director: '"Director"',
  Manager: '("Manager" OR "Head of")',
};

export async function brightDataSearchPeople(criteria: {
  industry?: string;
  role?: string;
  locations?: string[];
  count: number;
  /** Query-hint only — Google snippets don't reliably state headcount, so this
   *  narrows the search but is never written back as a verified field. */
  companySize?: string;
  /** Biases the search AND filters the real, derived seniority of what comes back. */
  seniority?: string;
}): Promise<{ ok: boolean; prospects: BrightDataProspect[]; error?: string }> {
  if (!API_KEY) return { ok: false, prospects: [], error: "Bright Data not configured" };

  const target = Math.max(1, Math.min(100, Math.round(criteria.count || 10)));
  const terms = [criteria.role, criteria.industry].filter(Boolean).join(" ").trim() || "professional";
  const generic = new Set(["", "worldwide", "global", "anywhere", "remote"]);
  const locs = (criteria.locations || []).filter((l) => !generic.has(l.toLowerCase()));
  const locPart = locs.length > 1 ? `(${locs.map((l) => `"${l}"`).join(" OR ")})` : locs[0] || "";
  const seniorityFilter = criteria.seniority && criteria.seniority !== "Any" ? criteria.seniority : undefined;
  const seniorityPart = seniorityFilter ? SENIORITY_QUERY_TERMS[seniorityFilter] || "" : "";
  const sizePart = criteria.companySize && criteria.companySize !== "Any" ? `"${criteria.companySize} employees"` : "";
  const query = `site:linkedin.com/in ${terms} ${seniorityPart} ${locPart} ${sizePart}`.replace(/\s+/g, " ").trim();
  const displayLocation = locs.join(", ");

  const prospects: BrightDataProspect[] = [];
  const seen = new Set<string>();
  try {
    // Google returns ~10/page; page through (safety cap 10 pages) until we hit target.
    for (let page = 0; page < 10 && prospects.length < target; page++) {
      const organic = await withRetry(() => brightDataSerp(query, page * 10, 120_000));
      if (!organic.length) break;
      for (const r of organic) {
        if (prospects.length >= target) break;
        const link = (r.link || "").split("?")[0];
        if (!/linkedin\.com\/in\//i.test(link) || seen.has(link)) continue;
        seen.add(link);
        const { name, title, company } = parseLinkedInTitle(r.title || "", criteria.role || "");
        const seniority = estimateSeniority(title);
        // Real post-filter: only keep results whose ACTUAL derived seniority
        // matches what was requested, rather than trusting the search bias alone.
        if (seniorityFilter && seniority && seniority !== seniorityFilter) continue;
        const { first, last } = splitName(name);
        prospects.push({
          full_name: cut(name, 150),
          first_name: cut(first, 100),
          last_name: cut(last, 100),
          title: cut(title, 150),
          seniority,
          company_name: cut(company, 200),
          location: cut(displayLocation, 150),
          linkedin: cut(link, 500),
          email: "",
        });
      }
    }
  } catch (e) {
    if (prospects.length) return { ok: true, prospects }; // partial page failed — keep what we have
    return { ok: false, prospects: [], error: e instanceof Error ? e.message : "Bright Data request failed" };
  }

  if (!prospects.length) return { ok: false, prospects: [], error: "No LinkedIn profiles found. Try broader criteria." };
  return { ok: true, prospects };
}

// Search-result domains that are never a company's own website — directories,
// social networks, and aggregators that just happen to rank for a company name.
const NON_COMPANY_DOMAINS = new Set([
  "linkedin.com", "facebook.com", "twitter.com", "x.com", "instagram.com",
  "indeed.com", "glassdoor.com", "wikipedia.org", "crunchbase.com",
  "zoominfo.com", "bloomberg.com", "youtube.com", "github.com",
  "yelp.com", "google.com", "apple.com", "wellfound.com", "pitchbook.com",
]);

/**
 * Finds a company's real website by searching for its name — reuses the same
 * Bright Data zone/credentials as the people search (no separate product/cost).
 * Free-associates nothing: returns null rather than guessing when no plausible
 * company-owned domain shows up in the first page of results.
 */
export async function brightDataFindCompanyWebsite(companyName: string): Promise<string | null> {
  if (!API_KEY || !companyName.trim()) return null;
  try {
    const organic = await withRetry(() => brightDataSerp(`"${companyName}" official website`, 0, 60_000));
    for (const r of organic) {
      const link = (r.link || "").trim();
      if (!/^https?:\/\//i.test(link)) continue;
      let host = "";
      try { host = new URL(link).hostname.replace(/^www\./, "").toLowerCase(); } catch { continue; }
      if (!host || [...NON_COMPANY_DOMAINS].some((d) => host === d || host.endsWith(`.${d}`))) continue;
      return `https://${host}`;
    }
    return null;
  } catch {
    return null;
  }
}
