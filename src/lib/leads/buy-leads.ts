"use server";
import { aiJson } from "@/lib/ai/client";

export interface BuyCriteria {
  industry: string;
  role: string;
  location: string;
  count: number;
}

export interface GeneratedProspect {
  full_name: string;
  title: string;
  company_name: string;
  industry: string;
  website_url: string;
}

export interface BuyLeadsResult {
  ok: boolean;
  prospects: GeneratedProspect[];
  error?: string;
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
