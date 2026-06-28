"use server";
import { createClient } from "@/lib/supabase/server";
import { createLead, getLeads, updateLead } from "@/lib/queries/leads";
import { createCampaign, getCampaigns, getCampaignStats, updateCampaign } from "@/lib/queries/campaigns";
import { createSegment, getSegments } from "@/lib/queries/segments";
import { createEmailTemplate, getEmailTemplates } from "@/lib/queries/templates";
import { getNewsletters } from "@/lib/queries/newsletters";
import { sendNewsletter } from "@/lib/email/newsletter-actions";
import { getUsers } from "@/lib/queries/users";
import { sendLeadEmail } from "@/lib/email/actions";

const API_KEY = process.env.AI_API_KEY;
const BASE_URL = process.env.AI_BASE_URL || "https://api.groq.com/openai/v1";
const MODEL = process.env.AI_MODEL || "llama-3.3-70b-versatile";

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

/** A mutating action the agent wants to run — executed only after admin approval. */
export interface ProposedAction {
  tool: string;
  args: Record<string, unknown>;
  /** Short human summary shown on the approval card */
  summary: string;
}

export interface AssistantResult {
  reply: string;
  actions: string[]; // log of executed (read-only auto + approved) work
  proposal?: ProposedAction[]; // pending writes awaiting admin approval
  error?: string;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
const TOOLS = [
  // ---------- READ (auto-executed) ----------
  {
    type: "function",
    function: {
      name: "get_workspace_stats",
      description: "Live workspace numbers: total/hot/converted leads and campaign stats.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_users",
      description: "List the workspace team: each member's name, email, role, status, and per-tab permission overrides. Use for any question about admins/users/roles/permissions.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_leads",
      description: "Search leads. Returns up to 10 matches with id, name, email, company, status, score.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Matched against name, email, company" },
          status: { type: "string", enum: ["New", "Warm", "Hot", "Scored", "Converted"] },
          industry: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_campaigns",
      description: "List campaigns with id, name, status, sent count.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_segments",
      description: "List audience segments with id, name, type, status.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_templates",
      description: "List email templates with id, name, subject.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_newsletters",
      description: "List newsletters with id, title, status (Draft/Sent/etc.), recipients and sent count.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ---------- WRITE (requires admin approval) ----------
  {
    type: "function",
    function: {
      name: "create_lead",
      description: "[Needs approval] Create a lead. Requires a name or company, plus an email, website, or LinkedIn URL.",
      parameters: {
        type: "object",
        properties: {
          full_name: { type: "string" }, email: { type: "string" }, company_name: { type: "string" },
          industry: { type: "string" }, interest_area: { type: "string" }, website_url: { type: "string" },
          linkedin: { type: "string" }, phone: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lead",
      description: "[Needs approval] Update fields on a lead. Use search_leads first to get lead_id, and pass display = the lead's name.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          display: { type: "string", description: "Lead's name for the approval card" },
          status: { type: "string", enum: ["New", "Warm", "Hot", "Scored", "Converted"] },
          full_name: { type: "string" }, email: { type: "string" }, company_name: { type: "string" },
          industry: { type: "string" }, interest_area: { type: "string" }, phone: { type: "string" },
        },
        required: ["lead_id", "display"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_campaign",
      description: "[Needs approval] Create an email campaign (saved as Draft).",
      parameters: {
        type: "object",
        properties: {
          campaign_name: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["campaign_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_campaign",
      description: "[Needs approval] Update a campaign's name/subject/content/status. Use list_campaigns first; pass display = campaign name.",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
          display: { type: "string" },
          campaign_name: { type: "string" },
          subject: { type: "string" },
          content: { type: "string" },
          status: { type: "string", enum: ["Draft", "Active", "Paused", "Completed"] },
        },
        required: ["campaign_id", "display"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_segment",
      description: "[Needs approval] Create an audience segment with simple rules.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          rules: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string", enum: ["industry", "interest_area", "status", "lead_score", "source"] },
                operator: { type: "string", enum: ["equals", "contains", "greater_than", "less_than"] },
                value: { type: "string" },
              },
              required: ["field", "operator", "value"],
            },
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_email_template",
      description: "[Needs approval] Save a reusable email template. Supports {{firstName}}, {{companyName}} variables.",
      parameters: {
        type: "object",
        properties: { template_name: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
        required: ["template_name", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email_to_lead",
      description: "[Needs approval] Send a real email to a lead. Use search_leads first; pass display = lead's name. The admin sees the recipient/subject before it sends.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          display: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["lead_id", "display", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_newsletter",
      description: "[Needs approval] Send a newsletter to its subscribed audience now. Use list_newsletters first; pass display = newsletter title.",
      parameters: {
        type: "object",
        properties: { newsletter_id: { type: "string" }, display: { type: "string" } },
        required: ["newsletter_id", "display"],
      },
    },
  },
];

const WRITE_TOOLS = new Set([
  "create_lead", "update_lead",
  "create_campaign", "update_campaign",
  "create_segment",
  "create_email_template",
  "send_email_to_lead",
  "send_newsletter",
]);

const SYSTEM_PROMPT = `You are the LeadPro AI assistant — an in-app agent for a lead-nurturing platform. You can read workspace data instantly and propose changes that run after the admin approves them.

App map: Dashboard → Leads (Add Leads wizard, capture form) → Campaigns (Sequences + Email Campaigns) → Inbox → Segments → Newsletters → Templates → Workflows → Analytics. Admin: User Management, Capture Form, Settings.

How your tools work:
- READ tools (stats, list_users, search_leads, list_*) run immediately — use them freely to answer questions.
- WRITE tools (create/update/send) do NOT run immediately. Calling one queues it on an approval card the admin must accept. So when the user asks for a change, call the tool right away with precise args and a clear "display" label — do not ask permission in text, the approval card handles that.
- A QUESTION is never a reason to call a write tool. "How many admins are there?" → list_users. Only call write tools when the user explicitly asks to create, update, or send something.
- You cannot delete any records. If the user asks to delete something, politely explain that deletion is not available through the assistant.

Reporting style — precise like a careful engineer:
- State exactly what you found or queued, with real values (names, emails, counts, statuses). Never a bare "Done!".
- Only claim what tool results confirm. If a tool errored, quote the error and say the step did NOT happen.
- Multiple findings/actions → short bullets. Separate "Done" from "Needs approval" from "Not possible".
- Ambiguous target (which lead?) → ask ONE precise clarifying question instead of guessing.
- You only see this workspace's data; never invent numbers.

Scope — IMPORTANT: You ONLY help with LeadPro and this workspace (leads, campaigns, inbox, opportunities, segments, newsletters, templates, analytics, settings). If the user asks about general knowledge, coding help, trivia, or anything unrelated to LeadPro, do NOT answer it — reply briefly: "I can only help with LeadPro — your leads, campaigns, inbox, opportunities, and analytics." Then suggest one relevant thing they could ask.`;

// ---------------------------------------------------------------------------
// Read-tool execution (auto). All queries run under the caller's session — RLS
// keeps everything workspace-scoped.
// ---------------------------------------------------------------------------
async function executeReadTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "get_workspace_stats": {
        const [leads, campaigns] = await Promise.all([getLeads(), getCampaignStats()]);
        return JSON.stringify({
          total_leads: leads.length,
          hot_leads: leads.filter((l) => l.status === "Hot").length,
          converted_leads: leads.filter((l) => l.status === "Converted").length,
          campaigns,
        });
      }
      case "list_users": {
        const users = await getUsers();
        return JSON.stringify(users.map((u) => ({
          name: u.full_name, email: u.email, role: u.role_name, status: u.status,
          permission_overrides: u.nav_access && Object.keys(u.nav_access).length ? u.nav_access : "role defaults",
        })));
      }
      case "search_leads": {
        const leads = await getLeads();
        const q = String(args.query || "").toLowerCase();
        const matches = leads.filter((l) => {
          const text = `${l.full_name || ""} ${l.email || ""} ${l.company_name || ""}`.toLowerCase();
          return (!q || text.includes(q))
            && (!args.status || l.status === args.status)
            && (!args.industry || (l.industry || "").toLowerCase() === String(args.industry).toLowerCase());
        }).slice(0, 10).map((l) => ({ id: l.id, name: l.full_name, email: l.email, company: l.company_name, status: l.status, score: l.lead_score }));
        return JSON.stringify({ count: matches.length, leads: matches });
      }
      case "list_campaigns": {
        const cs = await getCampaigns();
        return JSON.stringify(cs.map((c) => ({ id: c.id, name: c.campaign_name, status: c.status, sent: c.sent_count })));
      }
      case "list_segments": {
        const ss = await getSegments();
        return JSON.stringify(ss.map((s) => ({ id: s.id, name: s.segment_name, type: s.segment_type, status: s.status, contacts: s.contacts })));
      }
      case "list_templates": {
        const ts = await getEmailTemplates();
        return JSON.stringify(ts.map((t) => ({ id: t.id, name: t.template_name, subject: t.subject })));
      }
      case "list_newsletters": {
        const ns = await getNewsletters();
        return JSON.stringify(ns.map((n) => ({ id: n.id, title: n.title, status: n.status, recipients: n.recipient_count, sent: n.sent_count })));
      }
      default:
        return JSON.stringify({ error: `Unknown read tool ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : "Tool failed" });
  }
}

// ---------------------------------------------------------------------------
// Write-tool execution — ONLY called from approveAssistantActions after the
// admin clicked Approve in the UI.
// ---------------------------------------------------------------------------
async function executeWriteTool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; detail: string }> {
  switch (name) {
    case "create_lead": {
      if (!(args.full_name || args.company_name) || !(args.email || args.website_url || args.linkedin)) {
        return { ok: false, detail: "Lead needs a name/company AND an email, website, or LinkedIn URL." };
      }
      const lead = await createLead({
        full_name: (args.full_name as string) || null, email: (args.email as string) || null,
        company_name: (args.company_name as string) || null, industry: (args.industry as string) || null,
        interest_area: (args.interest_area as string) || null, website_url: (args.website_url as string) || null,
        linkedin: (args.linkedin as string) || null, phone: (args.phone as string) || null,
        source: "AI Assistant", status: "New",
      });
      return { ok: true, detail: `Created lead ${args.full_name || args.company_name} (id ${String(lead.id).slice(0, 8)}…)` };
    }
    case "update_lead": {
      const fields: Record<string, unknown> = {};
      for (const k of ["status", "full_name", "email", "company_name", "industry", "interest_area", "phone"]) {
        if (args[k] !== undefined) fields[k] = args[k];
      }
      if (!Object.keys(fields).length) return { ok: false, detail: "No fields to update." };
      await updateLead(String(args.lead_id), fields);
      return { ok: true, detail: `Updated ${args.display}: ${Object.entries(fields).map(([k, v]) => `${k} → ${v}`).join(", ")}` };
    }
    case "create_campaign": {
      const c = await createCampaign({
        campaign_name: String(args.campaign_name),
        subject: args.subject ? String(args.subject) : null,
        content: args.body ? String(args.body) : null,
      });
      return { ok: true, detail: `Created draft campaign “${args.campaign_name}” (id ${String(c?.id).slice(0, 8)}…)` };
    }
    case "update_campaign": {
      const fields: Record<string, unknown> = {};
      for (const k of ["campaign_name", "subject", "content", "status"]) {
        if (args[k] !== undefined) fields[k] = args[k];
      }
      if (!Object.keys(fields).length) return { ok: false, detail: "No fields to update." };
      await updateCampaign(String(args.campaign_id), fields);
      return { ok: true, detail: `Updated campaign ${args.display}: ${Object.keys(fields).join(", ")}` };
    }
    case "create_segment": {
      const rules = Array.isArray(args.rules)
        ? (args.rules as Array<{ field: string; operator: string; value: string }>).map((r, i) => ({
            field: r.field, operator: r.operator, value: r.value, rule_order: i,
          }))
        : [];
      await createSegment(String(args.name), String(args.description || ""), "Dynamic", rules);
      return { ok: true, detail: `Created segment “${args.name}” with ${rules.length} rule${rules.length === 1 ? "" : "s"}` };
    }
    case "create_email_template":
      await createEmailTemplate({ template_name: String(args.template_name), subject: String(args.subject), body: String(args.body) });
      return { ok: true, detail: `Saved template “${args.template_name}”` };
    case "send_email_to_lead": {
      const res = await sendLeadEmail(String(args.lead_id), String(args.subject), String(args.body));
      if (!res.ok) return { ok: false, detail: res.error || "Send failed" };
      return { ok: true, detail: `Sent “${args.subject}” to ${args.display}` };
    }
    case "send_newsletter": {
      const res = await sendNewsletter(String(args.newsletter_id));
      if (!res.ok) return { ok: false, detail: res.error || "Send failed" };
      return { ok: true, detail: `Sent newsletter ${args.display} to ${res.sent ?? 0} recipient${res.sent === 1 ? "" : "s"}${res.redirectedMessage ? ` (${res.redirectedMessage})` : ""}` };
    }
    default:
      return { ok: false, detail: `Unknown write tool ${name}` };
  }
}

/** Short human summary for the approval card. */
function summarizeAction(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "create_lead": return `Create lead ${args.full_name || args.company_name || "?"}${args.email ? ` (${args.email})` : ""}`;
    case "update_lead": {
      const changes = ["status", "full_name", "email", "company_name", "industry", "interest_area", "phone"]
        .filter((k) => args[k] !== undefined).map((k) => `${k} → ${args[k]}`).join(", ");
      return `Update lead ${args.display}: ${changes || "no changes"}`;
    }
    case "create_campaign": return `Create draft campaign “${args.campaign_name}”`;
    case "update_campaign": return `Update campaign ${args.display}`;
    case "create_segment": return `Create segment “${args.name}”`;
    case "create_email_template": return `Save template “${args.template_name}”`;
    case "send_email_to_lead": return `Send email to ${args.display} — “${args.subject}”`;
    case "send_newsletter": return `Send newsletter ${args.display} to its subscribed audience`;
    default: return name;
  }
}

// ---------------------------------------------------------------------------
// Rate-limit-aware completion call: retries 429/5xx with backoff instead of
// surfacing raw provider errors.
// ---------------------------------------------------------------------------
// Known-good current Groq model. If the configured AI_MODEL has been
// decommissioned (provider returns 400), we transparently retry on this one so
// a stale deployment env var can't take the whole assistant offline.
const FALLBACK_MODEL = "llama-3.3-70b-versatile";

async function chatCompletion(body: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; status: number; text: string }> {
  let lastStatus = 0;
  let lastText = "";
  let triedFallback = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true, data: await res.json() };

    lastStatus = res.status;
    lastText = await res.text();

    // Configured model is gone/invalid → switch to the fallback once and retry.
    if (res.status === 400 && !triedFallback && body.model !== FALLBACK_MODEL
        && /model|decommission|does not exist|not found/i.test(lastText)) {
      triedFallback = true;
      body = { ...body, model: FALLBACK_MODEL };
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      // Respect the provider's suggested wait when present, else backoff
      let waitMs = (attempt + 1) * 4000;
      const m = lastText.match(/try again in (\d+(?:\.\d+)?)s/i);
      if (m) waitMs = Math.ceil(parseFloat(m[1]) * 1000) + 500;
      const ra = res.headers.get("retry-after");
      if (ra && !Number.isNaN(Number(ra))) waitMs = Number(ra) * 1000 + 500;
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 20000)));
      continue;
    }
    break; // non-retryable
  }
  return { ok: false, status: lastStatus, text: lastText };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------
// Words that mark a message as LeadPro-related. If a message has none of these
// (and isn't a greeting/meta question), we treat it as off-topic and answer with
// a canned reply WITHOUT calling the model — saving tokens.
const DOMAIN_KEYWORDS = [
  "lead", "campaign", "email", "mail", "inbox", "repl", "opportunit", "pipeline", "deal", "revenue",
  "segment", "score", "scoring", "newsletter", "outreach", "sequence", "contact", "dashboard", "analytic",
  "send", "sent", "bounce", "open rate", "click", "convert", "prospect", "workspace", "member",
  "template", "capture", "blocklist", "unsubscrib", "linkedin", "brevo", "unipile", "follow up", "follow-up",
  "stat", "hot", "warm", "cold", "import", "csv", "message", "subject", "schedul", "mailbox", "connect",
  "user", "admin", "role", "permission", "settings", "report", "audience", "reply rate", "engage",
];
const META_ALLOW = [
  /^\s*(hi|hello|hey|yo|hola|sup)\b/i,
  /what\s+can\s+you\s+(do|help)/i,
  /^\s*(help|menu|options)\b/i,
  /who\s+are\s+you/i,
  /^\s*(thanks?|thank you|ok|okay|cool|great|nice)\b/i,
  /good\s+(morning|evening|afternoon)/i,
];
// Action verbs that signal an app command — these always go to the model, even if
// the noun is misspelled ("delete all the campigns").
const ACTION_VERBS = /\b(create|add|delete|remove|send|update|edit|change|rename|mark|move|convert|draft|write|compose|schedul|launch|pause|resume|stop|start|score|enrich|import|export|show|list|find|get|fetch|count|search|set|assign|reply|how\s+many|how\s+much)\b/i;
// Clear general-knowledge / off-topic patterns — only these short-circuit the model.
const OFF_TOPIC_PATTERNS = [
  /\b(capital of|weather|temperature|recipe|poem|joke|lyrics|population of|translate|president|prime minister|who\s+(is|was|won)|what year|distance between|meaning of|how to (cook|bake|make a)|movie|football|cricket|stock price|bitcoin|crypto|horoscope|news today|define\b)\b/i,
  /^\s*\d+\s*[-+*/x]\s*\d+\s*=?\s*$/, // bare arithmetic
];
const OFF_TOPIC_REPLY =
  "I can only help with LeadPro — your leads, campaigns, inbox, opportunities, and analytics. I can't answer general questions. Try asking me something like “How many hot leads do I have?” or “Create a follow-up campaign for new leads.”";

/**
 * Token-saving guard. Lenient by design: anything that looks like an app command
 * (a LeadPro keyword OR an action verb) goes to the model. Only messages that
 * clearly match general-knowledge patterns — with no app signal — are answered
 * with the canned reply. The system prompt is the real backstop for the rest.
 */
function isOffTopic(history: AssistantMessage[]): boolean {
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const text = (lastUser?.content || "").toLowerCase().trim();
  if (!text) return false;
  if (META_ALLOW.some((r) => r.test(text))) return false;          // greetings / "what can you do"
  if (DOMAIN_KEYWORDS.some((k) => text.includes(k))) return false; // mentions a LeadPro topic
  if (ACTION_VERBS.test(text)) return false;                       // an app command (handles typos like "campigns")
  if (OFF_TOPIC_PATTERNS.some((r) => r.test(text))) return true;   // clearly general knowledge → skip the model
  return false;                                                    // unsure → let the model (+ system prompt) decide
}

export async function runAssistant(history: AssistantMessage[]): Promise<AssistantResult> {
  if (!API_KEY) return { reply: "", actions: [], error: "AI isn't enabled on this environment. An admin needs to add the AI_API_KEY (and AI_MODEL) environment variables to the deployment, then redeploy." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { reply: "", actions: [], error: "Not authenticated." };

  // Off-topic guard — answer without spending tokens on the model.
  if (isOffTopic(history)) {
    return { reply: OFF_TOPIC_REPLY, actions: [] };
  }

  const trimmed = history.slice(-16);

  interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
  type ApiMessage =
    | { role: "system" | "user" | "assistant"; content: string }
    | { role: "assistant"; content: string | null; tool_calls: ToolCall[] }
    | { role: "tool"; tool_call_id: string; content: string };

  const messages: ApiMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...trimmed.map((m) => ({ role: m.role, content: m.content })),
  ];

  const actions: string[] = [];

  for (let turn = 0; turn < 6; turn++) {
    const res = await chatCompletion({
      model: MODEL, messages, tools: TOOLS, tool_choice: "auto", temperature: 0.4, max_tokens: 1500,
    });

    if (!res.ok) {
      const friendly = res.status === 429
        ? "The AI provider is busy right now — I retried a few times but it's still rate-limited. Please try again in a minute; nothing was lost."
        : `The AI provider returned an error (${res.status}). Please try again.`;
      return { reply: "", actions, error: friendly };
    }

    const msg = (res.data as { choices?: { message?: { content?: string; tool_calls?: ToolCall[] } }[] }).choices?.[0]?.message;
    if (!msg) return { reply: "", actions, error: "Empty AI response. Please try again." };

    const toolCalls = msg.tool_calls;
    if (toolCalls?.length) {
      // Split this batch: writes become a proposal, reads execute now.
      const writes: ProposedAction[] = [];
      const reads: ToolCall[] = [];
      for (const tc of toolCalls) {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(tc.function.arguments || "{}"); } catch { /* empty */ }
        if (WRITE_TOOLS.has(tc.function.name)) {
          writes.push({ tool: tc.function.name, args: parsed, summary: summarizeAction(tc.function.name, parsed) });
        } else {
          reads.push(tc);
        }
      }

      if (writes.length) {
        // Stop here — the admin must approve before anything mutates.
        const intro = msg.content?.trim()
          || (writes.length === 1
            ? "I'm ready to make this change — approve it below to proceed."
            : `I'm ready to make ${writes.length} changes — approve them below to proceed.`);
        return { reply: intro, actions, proposal: writes };
      }

      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: toolCalls });
      for (const tc of reads) {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(tc.function.arguments || "{}"); } catch { /* empty */ }
        const result = await executeReadTool(tc.function.name, parsed);
        messages.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
      continue;
    }

    return { reply: msg.content || "Done.", actions };
  }

  return { reply: "I hit my action limit for one request — ask me to continue.", actions };
}

// ---------------------------------------------------------------------------
// Approval execution — runs ONLY when the admin clicks Approve. Tool names are
// validated against the whitelist; everything runs under the caller's session
// so RLS keeps it inside their workspace.
// ---------------------------------------------------------------------------
export async function approveAssistantActions(
  proposal: ProposedAction[]
): Promise<{ ok: boolean; results: string[]; errors: string[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, results: [], errors: ["Not authenticated."] };

  const results: string[] = [];
  const errors: string[] = [];

  for (const action of proposal.slice(0, 10)) {
    if (!WRITE_TOOLS.has(action.tool)) {
      errors.push(`Blocked unknown action “${action.tool}”.`);
      continue;
    }
    try {
      const r = await executeWriteTool(action.tool, action.args || {});
      if (r.ok) results.push(r.detail);
      else errors.push(r.detail);
    } catch (err) {
      errors.push(`${action.summary}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  return { ok: errors.length === 0, results, errors };
}
