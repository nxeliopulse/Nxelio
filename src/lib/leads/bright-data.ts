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
  title: string;
  company_name: string;
  location: string;
  linkedin: string;
  email: string; // always "" — a SERP source has no email addresses
}

const cut = (s: string | undefined, n: number) => (s || "").trim().slice(0, n);

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

/** Parse a LinkedIn SERP title like "Jane Doe - Marketing Manager - Acme | LinkedIn". */
function parseLinkedInTitle(rawTitle: string, fallbackRole: string): { name: string; title: string; company: string } {
  const t = (rawTitle || "").replace(/\s*[|\-–]\s*LinkedIn\s*$/i, "").trim();
  const parts = t.split(/\s+[-–|]\s+/).map((p) => p.trim()).filter(Boolean);
  return {
    name: parts[0] || "N/A",
    title: parts[1] || fallbackRole || "",
    company: parts[2] || "",
  };
}

/**
 * Real LinkedIn people sourcing via Bright Data. Builds a Google query for
 * public LinkedIn profile pages and pages through the SERP until it has enough
 * unique profiles. Returns LinkedIn URL + parsed name/title/company (no email —
 * a SERP source can't provide verified emails).
 */
export async function brightDataSearchPeople(criteria: {
  industry?: string;
  role?: string;
  location?: string;
  count: number;
}): Promise<{ ok: boolean; prospects: BrightDataProspect[]; error?: string }> {
  if (!API_KEY) return { ok: false, prospects: [], error: "Bright Data not configured" };

  const target = Math.max(1, Math.min(50, Math.round(criteria.count || 10)));
  const terms = [criteria.role, criteria.industry].filter(Boolean).join(" ").trim() || "professional";
  const generic = new Set(["", "worldwide", "global", "anywhere", "remote"]);
  const loc = generic.has((criteria.location || "").toLowerCase()) ? "" : criteria.location || "";
  const query = `site:linkedin.com/in ${terms} ${loc}`.trim();

  const prospects: BrightDataProspect[] = [];
  const seen = new Set<string>();
  try {
    // Google returns ~10/page; page through (safety cap 10 pages) until we hit target.
    for (let page = 0; page < 10 && prospects.length < target; page++) {
      const organic = await brightDataSerp(query, page * 10, 60_000);
      if (!organic.length) break;
      for (const r of organic) {
        if (prospects.length >= target) break;
        const link = (r.link || "").split("?")[0];
        if (!/linkedin\.com\/in\//i.test(link) || seen.has(link)) continue;
        seen.add(link);
        const { name, title, company } = parseLinkedInTitle(r.title || "", criteria.role || "");
        prospects.push({
          full_name: cut(name, 150),
          title: cut(title, 150),
          company_name: cut(company, 200),
          location: cut(criteria.location, 150),
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
