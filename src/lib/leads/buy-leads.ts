"use server";
import { aiJson } from "@/lib/ai/client";
import { brightDataConfigured, brightDataSearchPeople, brightDataFindCompanyWebsite } from "@/lib/leads/bright-data";
import { anysiteConfigured, findEmailsByLinkedIn } from "@/lib/leads/anysite";
import { guessAndVerifyEmail } from "@/lib/leads/email-guess";
import { hasFeature } from "@/lib/queries/subscriptions";
import { mapWithConcurrency } from "@/lib/utils";

export interface BuyCriteria {
  industry: string;
  role: string;
  locations: string[];
  count: number;
}

export interface GeneratedProspect {
  full_name: string;
  title: string;
  company_name: string;
  industry: string;
  website_url: string;
  /** Real LinkedIn profile URL (from Bright Data); empty for AI samples. */
  linkedin?: string;
  location?: string;
  /** Found via Anysite when configured; empty if not found or not configured. Never fabricated. */
  email?: string;
}

export interface BuyLeadsResult {
  ok: boolean;
  prospects: GeneratedProspect[];
  /** "brightdata" = real prospects, "ai" = synthetic samples. */
  source?: "brightdata" | "ai";
  error?: string;
}

/**
 * Fetches prospects for the "Buy Leads" flow. Prefers Bright Data (real LinkedIn
 * profile sourcing via SERP); falls back to AI-generated samples when Bright
 * Data isn't configured or returns nothing.
 */
export async function searchBuyLeads(criteria: BuyCriteria): Promise<BuyLeadsResult> {
  if (!(await hasFeature("discovery"))) {
    return { ok: false, prospects: [], error: "Lead discovery isn't included on your plan. Upgrade to Starter or Pro to unlock it." };
  }
  if (brightDataConfigured) {
    const r = await brightDataSearchPeople(criteria);
    if (r.ok && r.prospects.length) {
      let prospects: GeneratedProspect[] = r.prospects.map((p) => ({
        full_name: p.full_name,
        title: p.title,
        company_name: p.company_name,
        industry: criteria.industry || "",
        website_url: "",
        linkedin: p.linkedin,
        location: p.location,
        email: p.email || "",
      }));

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
          return hit?.ok ? { ...p, email: hit.email || p.email } : p;
        });
        const emailCount = prospects.filter(p => p.email).length;
        console.log(`[buy-leads] Email enrichment done: ${emailCount}/${prospects.length} prospects have an email`);
        // Log misses so we can debug
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
          return g?.ok && g.email ? { ...p, email: g.email } : p;
        });
      }

      return { ok: true, source: "brightdata", prospects };
    }
    // Bright Data configured but failed → surface the error rather than faking data.
    return { ok: false, prospects: [], error: r.error || "No prospects found." };
  }
  // No Bright Data key → AI samples.
  const ai = await generateSampleProspects(criteria);
  return { ...ai, source: "ai" };
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
  const count = Math.max(1, Math.min(25, Math.round(criteria.count || 10)));
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
