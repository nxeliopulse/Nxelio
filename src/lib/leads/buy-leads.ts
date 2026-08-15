"use server";
import { aiJson } from "@/lib/ai/client";
import { brightDataConfigured, brightDataSearchPeople, brightDataFindCompanyWebsite, brightDataSearchCompanies } from "@/lib/leads/bright-data";
import { anysiteConfigured, findEmailsByLinkedIn, searchAnysiteUsers } from "@/lib/leads/anysite";
import { getActiveLeadProvider } from "@/lib/leads/provider";
import { guessAndVerifyEmail } from "@/lib/leads/email-guess";
import { hasFeature, getMaxBuyLeadsCount, canAffordLeads, deductLeads } from "@/lib/queries/subscriptions";
import { mapWithConcurrency } from "@/lib/utils";
import { bulkInsertLeads } from "@/lib/queries/leads";
import { findMatchingAccount, createAccount } from "@/lib/queries/accounts";

export interface BuyCriteria {
  industry: string;
  role: string;
  locations: string[];
  count: number;
  /** Query-hint only for Bright Data (no real per-prospect headcount data exists in
   *  this pipeline) — "Any" or omitted means no filtering. */
  companySize?: string;
  /** Biases the search AND filters results by their real, derived seniority. */
  seniority?: string;
  /** Drop any prospect whose email wasn't confirmed by a real check (AnySite hit,
   *  or an SMTP-verified/catch-all guess) — never relaxes into fabricating one. */
  requireVerifiedEmail?: boolean;
}

export interface GeneratedProspect {
  full_name: string;
  first_name?: string;
  last_name?: string;
  title: string;
  /** Derived from the real title text; "" when it can't be determined. */
  seniority?: string;
  company_name: string;
  industry: string;
  website_url: string;
  /** Real LinkedIn profile URL (from Bright Data); empty for AI samples. */
  linkedin?: string;
  location?: string;
  /** Found via Anysite when configured; empty if not found or not configured. Never fabricated. */
  email?: string;
  /** "valid" | "catch_all" — only set when email was actually confirmed by a real check. */
  emailVerificationStatus?: "valid" | "catch_all";
}

export interface BuyLeadsResult {
  ok: boolean;
  prospects: GeneratedProspect[];
  /** "brightdata" / "anysite" = real prospects (from whichever provider is active), "ai" = synthetic samples. */
  source?: "brightdata" | "anysite" | "ai";
  error?: string;
}

/**
 * Fetches prospects for the "Buy Leads" flow. Which real data source is used
 * (Anysite's own LinkedIn database, or Bright Data's SERP scraping) is a
 * platform-wide admin setting (see src/lib/leads/provider.ts) — both stay
 * fully wired, this just decides which one runs. Falls back to AI-generated
 * samples only when the active provider isn't configured at all.
 */
export async function searchBuyLeads(rawCriteria: BuyCriteria): Promise<BuyLeadsResult> {
  if (!(await hasFeature("discovery"))) {
    return { ok: false, prospects: [], error: "Lead discovery isn't included on your plan. Upgrade to Starter or Pro to unlock it." };
  }
  // Server-side enforcement of the per-request cap (100) and the plan's
  // remaining lead balance — the client's max attribute is a convenience,
  // not the real gate.
  const maxAllowed = await getMaxBuyLeadsCount();
  const criteria: BuyCriteria = { ...rawCriteria, count: Math.max(1, Math.min(rawCriteria.count, maxAllowed)) };
  const provider = await getActiveLeadProvider();

  if (provider === "anysite" && anysiteConfigured) {
    const r = await searchAnysiteUsers({ role: [criteria.role, criteria.industry].filter(Boolean).join(" ").trim(), locations: criteria.locations, count: criteria.count });
    if (r.ok && r.prospects.length) {
      const prospects: GeneratedProspect[] = r.prospects
        .filter((p) => !criteria.seniority || criteria.seniority === "Any" || p.seniority === criteria.seniority)
        .map((p) => ({
          full_name: p.full_name, first_name: p.first_name, last_name: p.last_name,
          title: p.title, seniority: p.seniority, company_name: p.company_name,
          industry: criteria.industry || "", website_url: "", linkedin: p.linkedin,
          location: p.location, email: "",
        }));
      return enrichWithAnysiteEmails(prospects, criteria.requireVerifiedEmail);
    }
    return { ok: false, prospects: [], error: r.error || "No prospects found." };
  }

  if (provider === "bright_data" && brightDataConfigured) {
    const r = await brightDataSearchPeople(criteria);
    if (r.ok && r.prospects.length) {
      const prospects: GeneratedProspect[] = r.prospects.map((p) => ({
        full_name: p.full_name,
        first_name: p.first_name,
        last_name: p.last_name,
        title: p.title,
        seniority: p.seniority,
        company_name: p.company_name,
        industry: criteria.industry || "",
        website_url: "",
        linkedin: p.linkedin,
        location: p.location,
        email: p.email || "",
      }));
      return enrichAndFilterProspects(prospects, criteria.requireVerifiedEmail);
    }
    // Configured but failed → surface the error rather than faking data.
    return { ok: false, prospects: [], error: r.error || "No prospects found." };
  }

  // Active provider isn't configured (missing API key) → AI samples, clearly labeled as such.
  const ai = await generateSampleProspects(criteria);
  return { ...ai, source: "ai" };
}

/** Anysite-only enrichment path — email lookup via Anysite's own endpoint,
 *  no Bright Data calls at all (so switching providers actually switches
 *  which vendor's credits get spent, with nothing silently mixed in). Company
 *  website is left empty ("Not available") rather than resolved via Bright Data. */
async function enrichWithAnysiteEmails(rawProspects: GeneratedProspect[], requireVerifiedEmail?: boolean): Promise<BuyLeadsResult> {
  let prospects = rawProspects;
  const urls = prospects.map((p) => p.linkedin).filter((u): u is string => Boolean(u));
  if (urls.length) {
    console.log(`[buy-leads/anysite] Enriching ${urls.length} profiles with Anysite email lookup…`);
    const found = await findEmailsByLinkedIn(urls);
    prospects = prospects.map((p) => {
      const hit = p.linkedin ? found.get(p.linkedin) : undefined;
      return hit?.ok ? { ...p, email: hit.email || p.email, emailVerificationStatus: hit.email ? "valid" : p.emailVerificationStatus } : p;
    });
  }
  if (requireVerifiedEmail) {
    prospects = prospects.filter((p) => p.email && p.emailVerificationStatus);
  }
  if (!prospects.length) {
    return { ok: false, prospects: [], error: requireVerifiedEmail ? "No prospects with a verified email found. Try broader criteria or turn off that filter." : "No prospects found." };
  }
  return { ok: true, source: "anysite", prospects };
}

/**
 * Shared by searchBuyLeads and searchPeopleAtCompanies (Company-wise Leads):
 * resolves each prospect's company website, enriches with a real email via
 * Anysite when configured, falls back to the pattern-guess+SMTP-verify method,
 * then (optionally) drops anyone whose email was never actually confirmed.
 * Never fabricates a website, email, or verification status.
 */
async function enrichAndFilterProspects(rawProspects: GeneratedProspect[], requireVerifiedEmail?: boolean): Promise<BuyLeadsResult> {
  let prospects = rawProspects;

  // Company website — free, reuses the same Bright Data credentials as the
  // people search. One lookup per UNIQUE company (leads sharing an employer
  // share the result) instead of one per prospect.
  const companyNames = [...new Set(prospects.map((p) => p.company_name).filter(Boolean))];
  const websiteByCompany = new Map<string, string | null>();
  await mapWithConcurrency(companyNames, 5, async (name) => {
    websiteByCompany.set(name, await brightDataFindCompanyWebsite(name));
  });
  prospects = prospects.map((p) => ({
    ...p,
    website_url: (p.company_name && websiteByCompany.get(p.company_name)) || p.website_url,
  }));

  // Enrich real LinkedIn profiles with an email via Anysite, when configured.
  // Never fabricated — a lookup miss just leaves email empty.
  if (anysiteConfigured) {
    const urls = prospects.map((p) => p.linkedin).filter((u): u is string => Boolean(u));
    console.log(`[buy-leads] Enriching ${urls.length} profiles with AnySite email lookup…`);
    const found = await findEmailsByLinkedIn(urls);
    prospects = prospects.map((p) => {
      const hit = p.linkedin ? found.get(p.linkedin) : undefined;
      return hit?.ok ? { ...p, email: hit.email || p.email, emailVerificationStatus: hit.email ? "valid" : p.emailVerificationStatus } : p;
    });
    const emailCount = prospects.filter(p => p.email).length;
    console.log(`[buy-leads] Email enrichment done: ${emailCount}/${prospects.length} prospects have an email`);
    found.forEach((result, url) => {
      if (!result.ok) console.log(`[buy-leads] Miss: ${url} → ${result.error}`);
    });
  }

  // Free fallback: for anyone AnySite (or no AnySite) still left without an
  // email, try the pattern-guess + SMTP-verify method against their company
  // website. See email-guess.ts for the serverless/port-25 caveat — this
  // step is a no-op (fails closed, never fabricates) wherever outbound SMTP
  // isn't reachable, e.g. on Vercel.
  const stillMissing = prospects.filter((p) => !p.email && p.website_url && p.full_name);
  if (stillMissing.length) {
    const guesses = await mapWithConcurrency(stillMissing, 5, async (p) => {
      const r = await guessAndVerifyEmail(p.full_name, p.website_url);
      return { key: p.linkedin || p.full_name, result: r };
    });
    const guessByKey = new Map(guesses.map((g) => [g.key, g.result]));
    prospects = prospects.map((p) => {
      if (p.email) return p;
      const g = guessByKey.get(p.linkedin || p.full_name);
      return g?.ok && g.email ? { ...p, email: g.email, emailVerificationStatus: g.status } : p;
    });
  }

  // Real filter — only drop prospects whose email was actually confirmed
  // by one of the checks above (Anysite hit, SMTP-valid, or catch-all
  // best-guess). Never relaxes into keeping an unconfirmed contact.
  if (requireVerifiedEmail) {
    prospects = prospects.filter((p) => p.email && p.emailVerificationStatus);
  }

  if (!prospects.length) {
    return { ok: false, prospects: [], error: requireVerifiedEmail ? "No prospects with a verified email found. Try broader criteria or turn off that filter." : "No prospects found." };
  }

  return { ok: true, source: "brightdata", prospects };
}

// ============================================================================
// Company-wise Leads — company-first discovery, then people at those companies
// ============================================================================
export interface CompanySearchCriteria {
  industry: string;
  subIndustry?: string;
  locations: string[];
  /** Query-hint only, same caveat as BuyCriteria.companySize — no real per-company
   *  headcount data exists in this pipeline, so it's never written back as a field. */
  companySize?: string;
  companyType?: string;
  keywords?: string;
  count: number;
}

export interface GeneratedCompany {
  name: string;
  industry: string;
  /** "" when unavailable — never guessed. */
  location: string;
  /** Real LinkedIn company page URL. */
  linkedin: string;
  /** Resolved via the same free website-lookup as people search; null if not found. */
  website: string | null;
}

export interface CompanySearchResult {
  ok: boolean;
  companies: GeneratedCompany[];
  source?: "brightdata" | "ai";
  error?: string;
}

/** Company-first discovery for the "Company-wise Leads" tab — mirrors searchBuyLeads's
 *  gating/fallback shape exactly, just for companies instead of people. */
export async function searchCompanies(rawCriteria: CompanySearchCriteria): Promise<CompanySearchResult> {
  if (!(await hasFeature("discovery"))) {
    return { ok: false, companies: [], error: "Lead discovery isn't included on your plan. Upgrade to Starter or Pro to unlock it." };
  }
  const maxAllowed = await getMaxBuyLeadsCount();
  const criteria: CompanySearchCriteria = { ...rawCriteria, count: Math.max(1, Math.min(rawCriteria.count, maxAllowed)) };

  if (brightDataConfigured) {
    const r = await brightDataSearchCompanies(criteria);
    if (r.ok && r.companies.length) {
      const websiteByName = new Map<string, string | null>();
      await mapWithConcurrency(r.companies, 5, async (c) => {
        websiteByName.set(c.name, await brightDataFindCompanyWebsite(c.name));
      });
      const companies: GeneratedCompany[] = r.companies.map((c) => ({
        name: c.name,
        industry: c.industry,
        location: c.location,
        linkedin: c.linkedin,
        website: websiteByName.get(c.name) ?? null,
      }));
      return { ok: true, source: "brightdata", companies };
    }
    return { ok: false, companies: [], error: r.error || "No companies found." };
  }
  const ai = await generateSampleCompanies(criteria);
  return { ...ai, source: "ai" };
}

/** AI-sample fallback for company search, same honesty rules as generateSampleProspects:
 *  clearly-fake .example.com domains, no LinkedIn URL (that would imply a real profile). */
async function generateSampleCompanies(criteria: CompanySearchCriteria): Promise<CompanySearchResult> {
  const count = Math.max(1, Math.min(100, Math.round(criteria.count || 10)));
  const system = "You generate SAMPLE B2B company data for a sales-tool demo. The data is synthetic, not real companies. Return ONLY valid JSON.";
  const prompt = `Generate ${count} sample companies matching:
- Industry: ${criteria.industry || "any"}${criteria.subIndustry ? ` (${criteria.subIndustry})` : ""}
- Location: ${criteria.locations.length ? criteria.locations.join(", ") : "global"}
${criteria.keywords ? `- Keywords: ${criteria.keywords}` : ""}

Return JSON: { "companies": [ { "name": "Company Name", "industry": "Industry" } ] }
Rules: ${count} items. Realistic, varied company names for the industry/location. No websites, no LinkedIn URLs.`;
  try {
    const out = await aiJson<{ companies: { name: string; industry?: string }[] }>({ system, prompt, temperature: 0.8, maxTokens: 2048 });
    const companies: GeneratedCompany[] = (out.companies || [])
      .filter((c) => c && c.name)
      .slice(0, count)
      .map((c) => ({ name: String(c.name).trim(), industry: String(c.industry || criteria.industry || "").trim(), location: "", linkedin: "", website: null }));
    if (!companies.length) return { ok: false, companies: [], error: "No companies were generated. Try broader criteria." };
    return { ok: true, companies };
  } catch (e) {
    return { ok: false, companies: [], error: e instanceof Error ? e.message : "Generation failed" };
  }
}

export interface CompanyPeopleCriteria {
  companyNames: string[];
  department?: string;
  role: string;
  seniority?: string;
  locations?: string[];
  count: number;
  requireVerifiedEmail?: boolean;
}

/** Second stage of Company-wise Leads: people search scoped to the selected
 *  companies, reusing the exact same enrichment pipeline as Individual Leads. */
export async function searchPeopleAtCompanies(rawCriteria: CompanyPeopleCriteria): Promise<BuyLeadsResult> {
  if (!(await hasFeature("discovery"))) {
    return { ok: false, prospects: [], error: "Lead discovery isn't included on your plan. Upgrade to Starter or Pro to unlock it." };
  }
  if (!rawCriteria.companyNames.length) {
    return { ok: false, prospects: [], error: "Select at least one company first." };
  }
  const maxAllowed = await getMaxBuyLeadsCount();
  const count = Math.max(1, Math.min(rawCriteria.count, maxAllowed));
  // Department has no dedicated query field in either provider's search —
  // fold it into the same free-text "role" term the way job title already works,
  // rather than inventing a filter the data source can't actually apply.
  const role = [rawCriteria.role, rawCriteria.department].filter(Boolean).join(" ").trim();
  const provider = await getActiveLeadProvider();

  if (provider === "anysite" && anysiteConfigured) {
    const r = await searchAnysiteUsers({ role, locations: rawCriteria.locations, count, companyNames: rawCriteria.companyNames });
    if (!r.ok || !r.prospects.length) {
      return { ok: false, prospects: [], error: r.error || "No prospects found at the selected companies." };
    }
    const prospects: GeneratedProspect[] = r.prospects
      .filter((p) => !rawCriteria.seniority || rawCriteria.seniority === "Any" || p.seniority === rawCriteria.seniority)
      .map((p) => ({
        full_name: p.full_name, first_name: p.first_name, last_name: p.last_name,
        title: p.title, seniority: p.seniority, company_name: p.company_name,
        industry: "", website_url: "", linkedin: p.linkedin, location: p.location, email: "",
      }));
    return enrichWithAnysiteEmails(prospects, rawCriteria.requireVerifiedEmail);
  }

  if (!brightDataConfigured) {
    return { ok: false, prospects: [], error: "Lead discovery requires the active provider to be configured." };
  }
  const r = await brightDataSearchPeople({
    role,
    locations: rawCriteria.locations,
    count,
    seniority: rawCriteria.seniority,
    companyNames: rawCriteria.companyNames,
  });
  if (!r.ok || !r.prospects.length) {
    return { ok: false, prospects: [], error: r.error || "No prospects found at the selected companies." };
  }
  const prospects: GeneratedProspect[] = r.prospects.map((p) => ({
    full_name: p.full_name,
    first_name: p.first_name,
    last_name: p.last_name,
    title: p.title,
    seniority: p.seniority,
    company_name: p.company_name,
    industry: "",
    website_url: "",
    linkedin: p.linkedin,
    location: p.location,
    email: p.email || "",
  }));
  return enrichAndFilterProspects(prospects, rawCriteria.requireVerifiedEmail);
}

/**
 * Generates a SAMPLE prospect list with AI for the "Buy Leads" flow.
 *
 * There is no real paid data-provider connected, so these are realistic-looking
 * but synthetic prospects for demoing the feature. We deliberately do NOT
 * generate email addresses — that keeps fabricated contacts out of real
 * campaign sends (a lead with no email is never emailed). Companies use a
 * clearly-fake example.com-style domain so they can't be mistaken for verified data.
 */
export async function generateSampleProspects(criteria: BuyCriteria): Promise<BuyLeadsResult> {
  const count = Math.max(1, Math.min(100, Math.round(criteria.count || 10)));
  const system =
    "You generate SAMPLE B2B prospect data for a sales-tool demo. The data is synthetic, not real people. Return ONLY valid JSON. Do not include email addresses. Use plausible but clearly-sample company websites.";
  const prompt = `Generate ${count} sample B2B prospects matching:
- Industry: ${criteria.industry || "any"}
- Job title / role: ${criteria.role || "decision maker"}
- Location: ${criteria.locations.length ? criteria.locations.join(", ") : "global"}

Return JSON in exactly this shape:
{
  "prospects": [
    { "full_name": "First Last", "title": "Job title", "company_name": "Company", "industry": "Industry", "website_url": "https://company-name.example.com" }
  ]
}
Rules: ${count} items. Realistic, varied names and companies for the industry/location. website_url must end in ".example.com". No emails, no phone numbers.`;

  try {
    const out = await aiJson<{ prospects: GeneratedProspect[] }>({ system, prompt, temperature: 0.8, maxTokens: 2048 });
    const prospects = (out.prospects || [])
      .filter((p) => p && p.full_name)
      .slice(0, count)
      .map((p) => ({
        full_name: String(p.full_name).trim(),
        title: String(p.title || "").trim(),
        company_name: String(p.company_name || "").trim(),
        industry: String(p.industry || criteria.industry || "").trim(),
        // Force a clearly-sample domain regardless of what the model returned
        website_url: /\.example\.com/i.test(String(p.website_url || ""))
          ? String(p.website_url).trim()
          : `https://${(p.company_name || "sample").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sample"}.example.com`,
      }));
    if (!prospects.length) return { ok: false, prospects: [], error: "No prospects were generated. Try broader criteria." };
    return { ok: true, prospects };
  } catch (e) {
    return { ok: false, prospects: [], error: e instanceof Error ? e.message : "Generation failed" };
  }
}

export interface PurchaseCompanyWiseLeadsResult {
  ok: boolean;
  inserted: number;
  duplicates: number;
  leadsRemaining?: number;
  error?: string;
}

/** Purchase step for Company-wise Leads: matches/creates one Account per unique
 *  selected company (reusing the same findMatchingAccount rules as everywhere
 *  else in the CRM, so this never creates a duplicate Account), then inserts
 *  the leads via the same bulkInsertLeads path Individual Leads uses, tagging
 *  each with discovered_account_id so the company relationship survives. */
export async function purchaseCompanyWiseLeads(prospects: GeneratedProspect[]): Promise<PurchaseCompanyWiseLeadsResult> {
  if (!prospects.length) return { ok: false, inserted: 0, duplicates: 0, error: "No prospects selected." };
  if (!(await canAffordLeads(prospects.length))) {
    return { ok: false, inserted: 0, duplicates: 0, error: "You don't have enough leads remaining on your plan this cycle. Upgrade your plan or wait for renewal." };
  }

  const companyNames = [...new Set(prospects.map((p) => p.company_name).filter(Boolean))];
  const accountIdByCompany = new Map<string, string>();
  await mapWithConcurrency(companyNames, 3, async (name) => {
    const sample = prospects.find((p) => p.company_name === name);
    const existing = await findMatchingAccount({ companyName: name, website: sample?.website_url || null });
    if (existing) {
      accountIdByCompany.set(name, existing.id);
      return;
    }
    try {
      const created = await createAccount({ account_name: name, website: sample?.website_url || null, industry: sample?.industry || null });
      accountIdByCompany.set(name, created.id);
    } catch (e) {
      console.error(`[company-wise-leads] Couldn't create Account for "${name}":`, e);
    }
  });

  const payload = prospects.map((p) => ({
    full_name: (p.full_name || "").slice(0, 150) || null,
    first_name: (p.first_name || "").slice(0, 100) || null,
    last_name: (p.last_name || "").slice(0, 100) || null,
    company_name: (p.company_name || "").slice(0, 200) || null,
    industry: (p.industry || "").slice(0, 100) || null,
    interest_area: (p.title || "").slice(0, 150) || null,
    job_title: (p.title || "").slice(0, 150) || null,
    seniority: p.seniority || null,
    email: p.email || null,
    email_verification_status: p.emailVerificationStatus || null,
    linkedin: p.linkedin || null,
    website_url: p.website_url || null,
    source: "Company-wise Leads",
    status: "New",
    discovered_account_id: (p.company_name && accountIdByCompany.get(p.company_name)) || null,
  }));

  const res = await bulkInsertLeads(payload, { defaultSource: "Company-wise Leads" });
  if (res.error) return { ok: false, inserted: 0, duplicates: res.duplicates, error: res.error };

  let leadsRemaining: number | undefined;
  if (res.inserted > 0) {
    try {
      const deductRes = await deductLeads(res.inserted, { source: "company_wise_leads" });
      if (!deductRes.ok) console.error("[company-wise-leads/credits] deduct failed:", deductRes.error);
      else leadsRemaining = deductRes.remaining;
    } catch (err) {
      console.error("[company-wise-leads/credits] deduct threw:", err);
    }
  }

  return { ok: true, inserted: res.inserted, duplicates: res.duplicates, leadsRemaining };
}
