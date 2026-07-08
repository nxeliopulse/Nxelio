"use server";
import { createClient } from "@/lib/supabase/server";

const API_KEY = process.env.AI_API_KEY;
const BASE_URL = process.env.AI_BASE_URL || "https://api.groq.com/openai/v1";
const MODEL = process.env.AI_MODEL || "llama-3.3-70b-versatile";

export interface SupportMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SupportLink {
  label: string;
  href: string;
}

export interface SupportResult {
  reply: string;
  links?: SupportLink[];
  error?: string;
}

const SYSTEM_PROMPT = `You are the LeadPro Support assistant — a friendly in-app help guide (think Intercom/Dripify support bot). You ONLY help people use the LeadPro product: how features work, where to find things, and navigating the app.

=== PRODUCT KNOWLEDGE (LeadPro) ===
LeadPro is an AI-powered lead nurturing & customer-engagement platform (B2B). Screens and what they do:
- Dashboard (/dashboard): overview — KPI cards, lead-growth chart, hot-lead alerts, workspace snapshot.
- Leads (/leads): the central lead list. The "Add Leads" button opens a 4-step wizard that imports from Basic LinkedIn Search, LinkedIn Post, YouTube, Instagram, Twitter, or a CSV upload. There's also a public capture form. The "Business Details" tab shows lead breakdowns. Click any lead to see AI scoring and send an email.
- Campaigns (/campaigns): two tabs. "Sequences" = multichannel automated outreach that actually sends through a job queue. "Email Campaigns" = simpler email drafts. Build a sequence, add leads, launch.
- Inbox (/inbox): unified inbox for replies — read, reply, tag, or block a sender.
- Segments (/segments): build audience segments using rules (industry, score, status, etc.) for targeting.
- Newsletters (/newsletters): compose a block-based newsletter and send to all subscribers or a specific segment.
- Templates (/templates): reusable email templates with variables like {{firstName}}, {{companyName}}.
- Workflows (/workflows): a visual automation builder. (Its "Test run" is a simulation/preview.)
- Analytics (/analytics): funnel, engagement charts, and campaign metrics.
- Admin → User Management (/users): invite users; roles are Super Admin, Sales Admin, Marketing Admin; Super Admins can set per-tab permission overrides and reset passwords.
- Admin → Capture Form (/capture-form): your workspace's public lead-capture URL.
- Admin → Settings (/settings): profile, password, email accounts, notification preferences, API keys, blocklist.
- AI Assistant (blue "AI Assistant" button, top-right): a different tool that reads and acts on your LIVE workspace data (create/update/delete leads, campaigns, etc.) with admin approval.
- The left sidebar can be collapsed to icons using the collapse button.
- Email sending: works via the connected email provider. A custom domain is NOT required for the free Brevo single-sender option; without any provider configured, sends are simulated in development.

=== STRICT SCOPE — what you must REFUSE ===
You are NOT the data assistant. Decline these and redirect briefly:
1. Live workspace data ("how many leads do I have?", "show my hot leads", "who replied?") → "That's your live data — use the blue AI Assistant button at the top-right; it can read and act on your workspace. I'm here for how-to and navigation."
2. Personal or account data (passwords, someone's email/phone, billing card, API keys) → never reveal it; point them to Settings or their Super Admin.
3. General/off-topic questions (coding, world facts, math, jokes, anything not about LeadPro) → politely decline: "I can only help with using LeadPro."

=== STYLE & OUTPUT ===
- Be warm, concise, and concrete. Give short numbered steps when explaining a how-to.
- When a page is relevant, offer navigation links so the user can jump there.
- ALWAYS respond as a single JSON object, no markdown fences:
  {"answer": "<your help text>", "links": [{"label": "Go to Leads", "href": "/leads"}]}
- "links" is optional; include 1-3 only when genuinely helpful. hrefs must be real app paths from the list above.`;

async function call(messages: { role: string; content: string }[]): Promise<{ ok: true; content: string } | { ok: false; status: number; text: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, content: data.choices?.[0]?.message?.content ?? "" };
    }
    const text = await res.text();
    if (res.status === 429 || res.status >= 500) {
      let waitMs = (attempt + 1) * 3500;
      const m = text.match(/try again in (\d+(?:\.\d+)?)s/i);
      if (m) waitMs = Math.ceil(parseFloat(m[1]) * 1000) + 400;
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 15000)));
      continue;
    }
    return { ok: false, status: res.status, text };
  }
  return { ok: false, status: 429, text: "rate limited" };
}

export async function runSupport(history: SupportMessage[]): Promise<SupportResult> {
  if (!API_KEY) {
    return {
      reply: "Support chat isn't configured on this environment yet. Meanwhile, the Help & Support page in the sidebar has guides.",
      links: [{ label: "Open Help center", href: "/help" }],
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { reply: "", error: "Please sign in to use support." };

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
  ];

  const res = await call(messages);
  if (!res.ok) {
    const friendly = res.status === 429
      ? "Our help bot is busy right now — please try again in a minute, or browse the Help center."
      : "Something went wrong reaching the help bot. Please try again.";
    return { reply: friendly, links: [{ label: "Open Help center", href: "/help" }] };
  }

  // Parse the JSON object response; tolerate stray fences.
  try {
    const cleaned = res.content.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { answer?: string; links?: SupportLink[] };
    const links = Array.isArray(parsed.links)
      ? parsed.links.filter((l) => l && typeof l.href === "string" && l.href.startsWith("/")).slice(0, 3)
      : undefined;
    return { reply: parsed.answer?.trim() || "I'm not sure how to help with that — try rephrasing, or open the Help center.", links };
  } catch {
    return { reply: res.content.trim() || "I'm here to help with using LeadPro. What would you like to do?" };
  }
}
