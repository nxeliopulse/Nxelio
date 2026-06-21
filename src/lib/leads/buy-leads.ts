"use server";
import { aiJson } from "@/lib/ai/client";
import { anysiteConfigured, anysiteSearchPeople } from "@/lib/leads/anysite";

export interface BuyCriteria {
  industry: string;
  role: string;
  location: string;
  count: number;
  /** Pull verified emails too (slower — ~35s/lead). Off by default. */
  withEmail?: boolean;
}

export interface GeneratedProspect {
  full_name: string;
  title: string;
  company_name: string;
  industry: string;
  website_url: string;
  /** Real LinkedIn profile URL (from AnySite); empty for AI samples. */
  linkedin?: string;
  location?: string;
  /** Verified email (from AnySite enrichment); empty when none found. */
  email?: string;
}

export interface BuyLeadsResult {
  ok: boolean;
  prospects: GeneratedProspect[];
  /** "anysite" = real prospects, "ai" = synthetic samples. */
  source?: "anysite" | "ai";
  error?: string;
}

/**
 * Fetches prospects for the "Buy Leads" flow. Prefers AnySite (real LinkedIn
 * people search); falls back to AI-generated samples when AnySite isn't
 * configured or returns nothing.
 */
export async function searchBuyLeads(criteria: BuyCriteria): Promise<BuyLeadsResult> {
  if (anysiteConfigured) {
    const r = await anysiteSearchPeople({ ...criteria, withEmail: !!criteria.withEmail });
    if (r.ok && r.prospects.length) {
      // When the user asked for verified emails, keep ONLY the ones that have one.
      const rows = criteria.withEmail ? r.prospects.filter((p) => p.email) : r.prospects;
      if (!rows.length) {
        return { ok: false, prospects: [], error: "No verified emails found for these filters. Try broader criteria, or turn off the email option to keep LinkedIn-only leads." };
      }
      return {
        ok: true,
        source: "anysite",
        prospects: rows.map((p) => ({
          full_name: p.full_name,
          title: p.title,
          company_name: p.company_name,
          industry: criteria.industry || "",
          website_url: "",
          linkedin: p.linkedin,
          location: p.location,
          email: p.email,
        })),
      };
    }
    // AnySite configured but failed → surface the error rather than silently faking data.
    return { ok: false, prospects: [], error: r.error || "No prospects found." };
  }
  // No AnySite key → AI samples.
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
- Location: ${criteria.location || "global"}

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
