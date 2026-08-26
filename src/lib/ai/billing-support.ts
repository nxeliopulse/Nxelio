"use server";
import { createClient } from "@/lib/supabase/server";
import { resolveAiConfig } from "@/lib/ai/provider";

export interface BillingSupportMessage {
  role: "user" | "assistant";
  content: string;
}

export interface BillingSupportPlanSummary {
  name: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
  features: string[];
}

export interface BillingSupportContext {
  planName: string;
  status: string;
  interval: string;
  creditsRemaining: number;
  creditsTotal: number;
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
  plans: BillingSupportPlanSummary[];
}

export interface BillingSupportResult {
  reply: string;
  error?: string;
}

function buildSystemPrompt(ctx: BillingSupportContext): string {
  const planLines = ctx.plans
    .map((p) => `- ${p.name}: $${(p.monthlyPriceCents / 100).toFixed(2)}/mo or $${(p.annualPriceCents / 100).toFixed(2)}/yr (billed annually). Includes: ${p.features.join("; ")}`)
    .join("\n");

  return `You are the Nxelio Nurture Billing & Subscription assistant — a focused help bot that ONLY answers questions about this workspace's plan, pricing, AI credits, trial, and cancellation. You are shown to the user only on the Subscription page.

=== THIS WORKSPACE'S CURRENT SUBSCRIPTION ===
Plan: ${ctx.planName}
Status: ${ctx.status}
Billing interval: ${ctx.interval}
AI credits remaining this cycle: ${ctx.creditsRemaining} / ${ctx.creditsTotal}
${ctx.cancelAtPeriodEnd ? `This subscription is scheduled to cancel on ${ctx.periodEnd ?? "the end of the current period"}.` : "This subscription is not scheduled to cancel."}

=== ALL PLANS ===
${planLines}

=== POLICIES (always true, regardless of current plan) ===
- New signups get a 7-day free trial on monthly billing. A card is required to start the trial, but there is no charge until day 7, and it can be canceled anytime before then at no cost. Upgrading or changing plans DURING the trial does not trigger an immediate charge — the trial (and its "no charge yet") continues until day 7 as normal; never say a change during the trial is billed immediately.
- Annual billing saves 20% versus monthly (compute the exact annual price from the per-plan numbers listed above under "ALL PLANS" — never estimate or use a rounded percentage like "2 months free" for a specific dollar figure).
- To cancel: use the "Cancel subscription" button on this page — it directly schedules cancellation for the end of the current billing period, with full access kept until then, undoable anytime before then via "Resume subscription". Do NOT direct users to "Manage billing" for canceling — that button is only for updating a payment method or viewing past invoices via Stripe's portal.
- There are no partial or prorated refunds for time already used in a billing period — canceling only stops future renewal, it does not refund the current period. If asked about refunds, state this directly rather than only describing the cancellation flow.
- AI credits are consumed per AI action (e.g. lead enrichment, AI scoring, an AI-drafted email = 1 credit each). Sending a campaign costs 2 credits per recipient; sending a newsletter costs 3 credits per recipient. Credits reset every billing cycle and unused credits do not roll over.
- A promo code can be redeemed on this page for a discount or bonus credits/leads, applied at the next checkout.

=== SCOPE ===
Only answer questions about plans, pricing, billing, AI credits, the trial, or cancellation for Nxelio Nurture. For anything else (live workspace data, unrelated topics, other products), politely say that's outside what you can help with here and suggest the general Help & Support widget instead.

=== STYLE ===
Be warm, concise, and concrete — 2 to 4 sentences. Plain text only, no markdown headers or code fences. Respond with ONLY the answer text.`;
}

async function callModel(apiKey: string, baseUrl: string, model: string, messages: { role: string; content: string }[]): Promise<{ ok: true; content: string } | { ok: false; status: number }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 400 }),
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, content: data.choices?.[0]?.message?.content ?? "" };
    }
    const bodyText = await res.text().catch(() => "");
    console.error(`[billing-support] model call failed: ${res.status} ${bodyText.slice(0, 500)}`);
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1500));
      continue;
    }
    return { ok: false, status: res.status };
  }
  return { ok: false, status: 429 };
}

export async function askBillingSupport(history: BillingSupportMessage[], context: BillingSupportContext): Promise<BillingSupportResult> {
  const { apiKey, baseUrl, model } = await resolveAiConfig();
  if (!apiKey) {
    return { reply: "Billing support chat isn't configured on this environment yet. For help with your subscription, please contact support." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { reply: "", error: "Please sign in to use billing support." };

  const messages = [
    { role: "system", content: buildSystemPrompt(context) },
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
  ];

  const res = await callModel(apiKey, baseUrl, model, messages);
  if (!res.ok) {
    return { reply: "Our billing assistant is busy right now — please try again in a moment, or contact support for help with your subscription." };
  }
  return { reply: res.content.trim() || "I'm here to help with plans, pricing, credits, and cancellation — what would you like to know?" };
}
