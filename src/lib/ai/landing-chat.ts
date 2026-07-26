"use server";
import { resolveAiConfig } from "@/lib/ai/provider";

export interface LandingChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LandingChatResult {
  reply: string;
}

const SYSTEM_PROMPT = `You are the Nxelio AI assistant embedded on the public marketing website. Visitors are prospective customers who have NOT signed up yet. Your job is to answer questions about the Nxelio product, features, and pricing, and to encourage qualified visitors to book a demo or start a free trial.

=== WHAT NXELIO IS ===
Nxelio is a B2B revenue platform: leads, campaigns, inbox, pipeline, segments, newsletters, and analytics in one workspace. It helps sales/marketing teams import or capture leads, run AI-assisted outreach, manage replies, track deals, and measure results.

=== FEATURES ===
- Lead Management: import leads via CSV or a public capture form; filter and manage the full prospect database.
- Email Campaigns: build and send outreach sequences with AI-written, personalised email copy.
- Smart Inbox: all replies land in one unified inbox to spot hot leads and follow up fast.
- Opportunities: a full kanban pipeline tracking every deal from first contact to closed-won.
- Segments: group leads into smart segments using AND/OR filter logic.
- Newsletters: design and send newsletters with open/click tracking.
- Analytics: campaign performance, open/click/reply rates, and lead engagement metrics.
- Capture Forms: a branded public form that feeds new leads straight into the workspace.

=== PRICING ===
- Basic: $14.99/mo, 200 AI credits/month, bring-your-own-leads (CSV import) — but includes the full toolkit: AI lead enrichment, AI lead scoring, email outreach, LinkedIn outreach, reply tracking, meetings & calendar sync, core workflows, and standard support. No automated lead discovery. Monthly billing includes a 7-day free trial (a card is required to start it, but there's no charge until day 7 and you can cancel anytime before then). Annual billing does not include a trial.
- Starter: $149.99/mo, everything in Basic plus automated lead discovery (1,000 AI-discovered leads/month) and 700 AI credits/month. This is the most popular plan.
- Pro: $299.99/mo, everything in Starter but with 2,000 AI-discovered leads/month and 1,500 AI credits/month, plus priority support.
- AI credits are consumed by AI actions (generating email copy, scoring a lead, enriching a contact). Unused monthly credits reset at renewal and don't roll over.
- AI-discovered leads are a separate allowance from AI credits, specifically for the automated lead-discovery feature (Starter/Pro only).
- Promo codes can be applied at checkout or when upgrading — they can discount the price, grant bonus AI credits, grant bonus leads, or combine several of these, depending on the code.
- Annual billing gets 20% off any plan, same features and allowances, billed once a year.
- Upgrades apply immediately and are prorated. Downgrades to a lower plan aren't available self-serve — customers should contact support if they need to move to a lower plan.
- Plans can be canceled anytime from the billing dashboard, no cancellation fees — access continues until the end of the current billing period.

=== SECURITY ===
Nxelio is built on Supabase with row-level security and full workspace isolation — data is never shared across workspaces/customers.

=== STYLE & OUTPUT ===
- Your answers may be read aloud by a text-to-speech voice, so write in short, natural, spoken sentences (2-4 sentences max). Never use markdown, bullet points, asterisks, or links in the reply text — plain conversational prose only.
- Be warm, confident, and concise. If genuinely useful, end with a soft nudge like suggesting they book a demo or start the free trial — but don't do this every single message, only when it fits naturally.
- If asked something totally unrelated to Nxelio (coding help, world facts, personal advice, etc.), politely decline and steer back: "I'm just here to help with questions about Nxelio — is there anything about the product I can help with?"
- Never invent pricing, features, or statistics beyond what's listed above. If you don't know something, say a team member can answer that on a demo call.`;

async function call(apiKey: string, baseUrl: string, model: string, messages: { role: string; content: string }[]): Promise<{ ok: true; content: string } | { ok: false; status: number }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.5,
        max_tokens: 300,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, content: data.choices?.[0]?.message?.content ?? "" };
    }
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
      continue;
    }
    return { ok: false, status: res.status };
  }
  return { ok: false, status: 429 };
}

/** Public, unauthenticated Q&A chat for the marketing landing page. No workspace/credit
 *  gating — bounded instead by trimming history and message length below. */
export async function askLandingAssistant(history: LandingChatMessage[]): Promise<LandingChatResult> {
  const { apiKey, baseUrl, model } = await resolveAiConfig();
  if (!apiKey) {
    return { reply: "Our AI assistant isn't available right now, but I'd love to show you around — try booking a demo instead!" };
  }

  const trimmed = history.slice(-8).map((m) => ({
    role: m.role,
    content: m.content.slice(0, 600),
  }));
  if (trimmed.length === 0) return { reply: "" };

  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...trimmed];
  const res = await call(apiKey, baseUrl, model, messages);
  if (!res.ok) {
    return {
      reply: res.status === 429
        ? "I'm getting a lot of questions right now — please try again in a moment."
        : "Something went wrong on my end — please try again in a moment.",
    };
  }

  return { reply: res.content.trim() || "I'm not sure how to answer that — want to book a demo and ask our team directly?" };
}
