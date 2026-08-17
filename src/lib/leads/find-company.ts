"use server";
import { brightDataSerp, brightDataConfigured, withRetry } from "@/lib/leads/bright-data";
import { aiChat, aiConfigured } from "@/lib/ai/client";
import { updateLead } from "@/lib/queries/leads";
import { canAfford, deductCredits } from "@/lib/queries/subscriptions";

const COMPANY_LOOKUP_OPERATION = "company_name_lookup";

export async function findAndSaveLeadCompany(
  leadId: string,
  linkedinUrl: string | null,
  fullName?: string | null
): Promise<{ ok: boolean; companyName?: string; error?: string; creditsUsed?: number; creditsRemaining?: number }> {
  if (!linkedinUrl || !linkedinUrl.trim()) {
    return { ok: false, error: "No LinkedIn URL available for this lead." };
  }

  if (!brightDataConfigured) {
    return { ok: false, error: "Bright Data is not configured." };
  }

  const hasAi = await aiConfigured().catch(() => false);
  if (!hasAi) {
    return { ok: false, error: "AI provider is not configured." };
  }

  // Same "check before you spend" gate as every other AI action in this app
  // (see assertCredits in ai/actions.ts) — never runs the paid lookup for a
  // workspace that can't afford it.
  if (!(await canAfford(1))) {
    return { ok: false, error: "You're out of AI credits for this billing cycle. Upgrade your plan for more." };
  }

  try {
    let results: Array<{ title?: string; description?: string }> = [];

    // Clean URL: Strip tracking params like ?miniProfileUrn=...
    const cleanUrl = linkedinUrl.trim().split("?")[0].replace(/\/$/, "");

    // Strategy 1 (Highest Accuracy): Search exact clean URL in quotes on Google
    results = await withRetry(() => brightDataSerp(`"${cleanUrl}"`, 0, 15000), 2).catch(() => []);

    // Strategy 2: Search by Lead Name + site:linkedin.com
    if ((!results || !results.length) && fullName && fullName.trim() && fullName.trim() !== "—") {
      const nameQuery = `"${fullName.trim()}" site:linkedin.com/in`;
      results = await withRetry(() => brightDataSerp(nameQuery, 0, 15000), 2).catch(() => []);
    }

    // Strategy 3: Search by URL slug
    if (!results || !results.length) {
      const match = cleanUrl.match(/linkedin\.com\/in\/[^/?#]+/i);
      if (match) {
        results = await withRetry(() => brightDataSerp(`site:${match[0]}`, 0, 15000), 2).catch(() => []);
      }
    }

    if (!results || !results.length) {
      return { ok: false, error: "No search results found for this LinkedIn profile." };
    }

    // Combine snippets from top 3 organic search results so no company info is missed
    const snippetText = results
      .slice(0, 3)
      .map((r) => [r.title, r.description].filter(Boolean).join(" - "))
      .filter(Boolean)
      .join("\n")
      .trim();

    if (!snippetText) {
      return { ok: false, error: "Empty profile snippet returned from search." };
    }

    // Extract company name using configured AI (OpenAI/Groq) with 3-tier priority rules
    const companyName = await aiChat({
      system:
        "You are a precise data extractor. Extract ONLY the CURRENT active employer business company name from the LinkedIn text.\n\nPRIORITY ORDER:\n1. PRIORITY 1: Active current job in Experience / Headline section (e.g. CEO at Freshtronics -> Freshtronics).\n2. PRIORITY 2: Profile Bio / Summary.\n\nRULES:\n- NEVER include schools, colleges, or universities (e.g. TNAU, Mahendra, Harvard).\n- NEVER include past ended jobs.\n- Return ONLY the single active current company name (e.g. Freshtronics).\n- If unknown, return UNKNOWN.",
      prompt: `Lead Name: ${fullName || ""}\nSnippet:\n${snippetText}`,
      temperature: 0,
      maxTokens: 25,
    });

    const cleaned = companyName.trim().replace(/^["']|["']$/g, "");
    
    // Strict validation to prevent writing invalid/garbage/college strings to database
    const isInvalid =
      !cleaned ||
      /^(empty|none|unknown|not found|no company|n\/a|null|undefined)/i.test(cleaned) ||
      cleaned.toLowerCase().includes("empty string") ||
      cleaned.toLowerCase().includes("no company") ||
      cleaned.toLowerCase().includes("not mentioned") ||
      /\b(college|university|institute|school|academy|tnau)\b/i.test(cleaned);

    if (isInvalid) {
      return { ok: false, error: "Could not extract real company name from profile snippet." };
    }

    // Save verified company name to Supabase lead row
    await updateLead(leadId, { company_name: cleaned });

    // Best-effort post-success deduction — mirrors chargeCredits() in
    // ai/actions.ts: a deduction failure here should never hide a result the
    // user already got real API/AI cost value for.
    let creditsRemaining: number | undefined;
    try {
      const deductRes = await deductCredits(COMPANY_LOOKUP_OPERATION, 1, { leadId });
      if (deductRes.ok) creditsRemaining = deductRes.remaining;
      else console.error("[find-company/credits] deduct failed:", deductRes.error);
    } catch (err) {
      console.error("[find-company/credits] deduct threw:", err);
    }

    return { ok: true, companyName: cleaned, creditsUsed: 1, creditsRemaining };
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === "AbortError" || err.message.toLowerCase().includes("aborted")) {
        return { ok: false, error: "Bright Data proxy search timed out. Please try again." };
      }
      if (err.message.includes("502 Bad Gateway") || err.message.includes("<html>")) {
        return { ok: false, error: "Bright Data is temporarily busy. Please try again." };
      }
    }
    const msg = err instanceof Error ? err.message : "Failed to find company name.";
    return { ok: false, error: msg };
  }
}
