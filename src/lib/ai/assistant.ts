"use server";
import { createClient } from "@/lib/supabase/server";
import { createLead, getLeads, updateLead, deleteLead } from "@/lib/queries/leads";
import { createCampaign, getCampaigns, getCampaignStats, updateCampaign, deleteCampaign } from "@/lib/queries/campaigns";
import { createSegment, getSegments, deleteSegment } from "@/lib/queries/segments";
import { createEmailTemplate, getEmailTemplates, deleteEmailTemplate } from "@/lib/queries/templates";
import { getNewsletters, deleteNewsletter } from "@/lib/queries/newsletters";
import { sendNewsletter } from "@/lib/email/newsletter-actions";
import { getUsers } from "@/lib/queries/users";
import { sendLeadEmail } from "@/lib/email/actions";
import { getOnboarding } from "@/lib/queries/onboarding";
import { canAfford, deductCredits } from "@/lib/queries/subscriptions";
import { resolveAiConfig } from "@/lib/ai/provider";

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
  // ---------- WRITE (requires admin approval — READ/CREATE/EDIT only, no deletes) ----------
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

const DELETE_TOOLS = new Set([
  "delete_lead", "delete_campaign", "delete_segment",
  "delete_template", "delete_newsletter",
]);

const BASE_SYSTEM_PROMPT = `You are the Nxelio Nurture AI Assistant — an intelligent in-app agent for the Nxelio Nurture sales engagement and lead-nurturing platform. You help users read workspace data instantly and propose approved changes through a secure approval workflow.

Application modules you support: Dashboard, Leads, Contacts, Campaigns, Inbox, Segments, Newsletters, Templates, Workflows, Analytics, Reports, Users, Roles, Billing, Credits, and Settings.

STRICT OPERATION RULES:
1. You support ONLY three operations: Read (instant), Create (approval required), and Edit/Update (approval required).
2. DELETE operations are COMPLETELY DISABLED. If a user asks to delete anything, respond: "Delete operations are not available through the AI assistant. Please use the application interface to delete records directly." Do not call any delete tool.
3. The off-topic refusal below is ONLY for questions with NO connection to Nxelio Nurture at all (e.g. weather, math, general knowledge, coding help, recipes, jokes, current events). It is NOT for greetings, and NOT for questions about how a Nxelio Nurture feature works — answer those directly from your own knowledge of the app, even when no tool call is needed (e.g. "how do I buy leads here" — explain the Buy Leads flow conversationally; a friendly greeting — reply warmly and ask how you can help). Only use this exact refusal for genuinely unrelated topics: "I'm the Nxelio Nurture Assistant and I can only help with application-related questions — such as your leads, campaigns, analytics, segments, billing, or settings. How can I help you with the platform today?"

How your tools work:
- READ tools (stats, list_users, search_leads, list_*) execute immediately — use them freely to answer data questions.
- WRITE tools (create/update/send) do NOT run immediately. They queue an approval card the admin must accept before anything changes.
- Never call a write tool for a question — only for an explicit create/update/send request.
- Not every on-topic question needs a tool call. Questions about how a feature works, what something means, or general guidance on using Nxelio Nurture should be answered directly and helpfully from your own knowledge, without forcing a tool call or a refusal.

Reporting style:
- Precise and factual — cite real values from tool results (names, emails, counts, statuses).
- Never invent or estimate data. If a tool errors, quote the error and state the action did NOT complete.
- Use short bullets for multiple items. Clearly separate Done / Needs Approval / Not Possible.
- If the target is ambiguous, ask ONE specific clarifying question rather than guessing.

Scope reminder: Only assist with Nxelio Nurture platform features. Politely decline everything else and redirect to a relevant platform question.`;

/** Builds the system prompt, appending real workspace context from onboarding when available. */
async function buildSystemPrompt(): Promise<string> {
  try {
    const { data } = await getOnboarding();
    if (!data) return BASE_SYSTEM_PROMPT;

    const lines: string[] = [
      "",
      "--- WORKSPACE BUSINESS CONTEXT (from onboarding) ---",
      `Company: ${data.company_name}`,
      `Industry: ${data.industry}`,
    ];
    if (data.company_size)        lines.push(`Company size: ${data.company_size} employees`);
    if (data.hq_location)         lines.push(`HQ: ${data.hq_location}`);
    if (data.target_customer_type) lines.push(`Target customers: ${data.target_customer_type}`);
    if (data.primary_product)     lines.push(`Primary product/service: ${data.primary_product}`);
    if (data.goals?.length)       lines.push(`Business goals: ${data.goals.join(", ")}`);
    if (data.key_competitors)     lines.push(`Key competitors: ${data.key_competitors}`);
    if (data.avg_deal_size)       lines.push(`Average deal size: ${data.avg_deal_size}`);
    if (data.sales_cycle)         lines.push(`Typical sales cycle: ${data.sales_cycle}`);
    if (data.company_description) lines.push(`About: ${data.company_description}`);
    lines.push(
      "",
      `Use this context in every response. When advising on leads, campaigns, or analytics, tailor your recommendations specifically to ${data.company_name}'s goals (${data.goals?.join(", ") || "growth"}), their ${data.target_customer_type} customer focus, and their competitive landscape. Make advice feel personal to this workspace, not generic.`,
      "---",
    );

    return BASE_SYSTEM_PROMPT + "\n" + lines.join("\n");
  } catch {
    return BASE_SYSTEM_PROMPT;
  }
}

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
      return { ok: true, detail: `Created lead ${args.full_name || args.company_name} (id ${String(lead.id).slice(0, 8)}...)` };
    }
    case "update_lead": {
      const fields: Record<string, unknown> = {};
      for (const k of ["status", "full_name", "email", "company_name", "industry", "interest_area", "phone"]) {
        if (args[k] !== undefined) fields[k] = args[k];
      }
      if (!Object.keys(fields).length) return { ok: false, detail: "No fields to update." };
      // Resolve partial/truncated IDs the AI may have remembered from earlier messages
      let leadId = String(args.lead_id);
      if (leadId.length < 36) {
        const all = await getLeads();
        const found = all.find((l) => l.id.startsWith(leadId)) || all.find((l) => l.full_name === String(args.display || ""));
        if (found) leadId = found.id;
      }
      await updateLead(leadId, fields);
      return { ok: true, detail: `Updated ${args.display}: ${Object.entries(fields).map(([k, v]) => `${k} -> ${v}`).join(", ")}` };
    }
    case "delete_lead":
      await deleteLead(String(args.lead_id));
      return { ok: true, detail: `Deleted lead ${args.display}` };
    case "create_campaign": {
      const c = await createCampaign({
        campaign_name: String(args.campaign_name),
        subject: args.subject ? String(args.subject) : null,
        content: args.body ? String(args.body) : null,
      });
      return { ok: true, detail: `Created draft campaign "${args.campaign_name}" (id ${String(c?.id).slice(0, 8)}...)` };
    }
    case "update_campaign": {
      const fields: Record<string, unknown> = {};
      for (const k of ["campaign_name", "subject", "content", "status"]) {
        if (args[k] !== undefined) fields[k] = args[k];
      }
      if (!Object.keys(fields).length) return { ok: false, detail: "No fields to update." };
      // Resolve partial/truncated IDs the AI may have remembered from earlier messages
      let campaignId = String(args.campaign_id);
      if (campaignId.length < 36) {
        const all = await getCampaigns();
        const found = all.find((c) => c.id.startsWith(campaignId)) || all.find((c) => c.campaign_name === String(args.display || ""));
        if (!found) return { ok: false, detail: `Campaign "${args.display}" not found. Please use list_campaigns to confirm the ID.` };
        campaignId = found.id;
      }
      await updateCampaign(campaignId, fields);
      return { ok: true, detail: `Updated campaign ${args.display}: ${Object.keys(fields).join(", ")}` };
    }
    case "delete_campaign":
      await deleteCampaign(String(args.campaign_id));
      return { ok: true, detail: `Deleted campaign ${args.display}` };
    case "create_segment": {
      const rules = Array.isArray(args.rules)
        ? (args.rules as Array<{ field: string; operator: string; value: string }>).map((r, i) => ({
            field: r.field, operator: r.operator, value: r.value, rule_order: i,
          }))
        : [];
      await createSegment(String(args.name), String(args.description || ""), "Dynamic", rules);
      return { ok: true, detail: `Created segment "${args.name}" with ${rules.length} rule${rules.length === 1 ? "" : "s"}` };
    }
    case "delete_segment":
      await deleteSegment(String(args.segment_id));
      return { ok: true, detail: `Deleted segment ${args.display}` };
    case "create_email_template":
      await createEmailTemplate({ template_name: String(args.template_name), subject: String(args.subject), body: String(args.body) });
      return { ok: true, detail: `Saved template "${args.template_name}"` };
    case "delete_template":
      await deleteEmailTemplate(String(args.template_id));
      return { ok: true, detail: `Deleted template ${args.display}` };
    case "send_email_to_lead": {
      const res = await sendLeadEmail(String(args.lead_id), String(args.subject), String(args.body));
      if (!res.ok) return { ok: false, detail: res.error || "Send failed" };
      return { ok: true, detail: `Sent "${args.subject}" to ${args.display}` };
    }
    case "delete_newsletter":
      await deleteNewsletter(String(args.newsletter_id));
      return { ok: true, detail: `Deleted newsletter ${args.display}` };
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
        .filter((k) => args[k] !== undefined).map((k) => `${k} -> ${args[k]}`).join(", ");
      return `Update lead ${args.display}: ${changes || "no changes"}`;
    }
    case "delete_lead": return `Delete lead ${args.display}`;
    case "create_campaign": return `Create draft campaign "${args.campaign_name}"`;
    case "update_campaign": return `Update campaign ${args.display}`;
    case "delete_campaign": return `Delete campaign ${args.display}`;
    case "create_segment": return `Create segment "${args.name}"`;
    case "delete_segment": return `Delete segment ${args.display}`;
    case "create_email_template": return `Save template "${args.template_name}"`;
    case "delete_template": return `Delete template ${args.display}`;
    case "send_email_to_lead": return `Send email to ${args.display} — "${args.subject}"`;
    case "delete_newsletter": return `Delete newsletter ${args.display}`;
    case "send_newsletter": return `Send newsletter ${args.display} to its subscribed audience`;
    default: return name;
  }
}

// ---------------------------------------------------------------------------
// Rate-limit-aware completion call: retries 429/5xx with backoff instead of
// surfacing raw provider errors.
// ---------------------------------------------------------------------------
// Only kicks in when explicitly configured — a provider-specific retry model
// (e.g. Groq's Llama fallback) has no equivalent on other providers like OpenAI.
const FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL;

async function chatCompletion(apiKey: string, baseUrl: string, body: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; status: number; text: string }> {
  let lastStatus = 0;
  let lastText = "";
  let triedFallback = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true, data: await res.json() };

    lastStatus = res.status;
    lastText = await res.text();

    // On any 400 from the primary model, retry once with the fallback model (if configured).
    if (res.status === 400 && !triedFallback && FALLBACK_MODEL && body.model !== FALLBACK_MODEL) {
      triedFallback = true;
      body = { ...body, model: FALLBACK_MODEL };
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      let waitMs = (attempt + 1) * 4000;
      const m = lastText.match(/try again in (\d+(?:\.\d+)?)s/i);
      if (m) waitMs = Math.ceil(parseFloat(m[1]) * 1000) + 500;
      const ra = res.headers.get("retry-after");
      if (ra && !Number.isNaN(Number(ra))) waitMs = Number(ra) * 1000 + 500;
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 20000)));
      continue;
    }
    break;
  }
  return { ok: false, status: lastStatus, text: lastText };
}

// ---------------------------------------------------------------------------
// Off-topic guard
// ---------------------------------------------------------------------------
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
const ACTION_VERBS = /\b(create|add|delete|remove|send|update|edit|change|rename|mark|move|convert|draft|write|compose|schedul|launch|pause|resume|stop|start|score|enrich|import|export|show|list|find|get|fetch|count|search|set|assign|reply|how\s+many|how\s+much)\b/i;
const OFF_TOPIC_PATTERNS = [
  /\b(capital of|weather|temperature|recipe|poem|joke|lyrics|population of|translate|president|prime minister|who\s+(is|was|won)|what year|distance between|meaning of|how to (cook|bake|make a)|movie|football|cricket|stock price|bitcoin|crypto|horoscope|news today|define\b)\b/i,
  /^\s*\d+\s*[-+*/x]\s*\d+\s*=?\s*$/,
];
const OFF_TOPIC_REPLY = "I'm the Nxelio Nurture Assistant and I can only help with application-related questions — such as your leads, campaigns, analytics, segments, billing, or settings. How can I help you with the platform today?";

function isOffTopic(history: AssistantMessage[]): boolean {
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const text = (lastUser?.content || "").toLowerCase().trim();
  if (!text) return false;
  if (META_ALLOW.some((r) => r.test(text))) return false;
  if (DOMAIN_KEYWORDS.some((k) => text.includes(k))) return false;
  if (ACTION_VERBS.test(text)) return false;
  if (OFF_TOPIC_PATTERNS.some((r) => r.test(text))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------
export async function runAssistant(history: AssistantMessage[]): Promise<AssistantResult> {
  const { apiKey, baseUrl, model, provider } = await resolveAiConfig();
  if (!apiKey) return { reply: "", actions: [], error: `AI isn't enabled on this environment. An admin needs to add the ${provider === "groq" ? "GROQ_API_KEY" : "OPENAI_API_KEY"} environment variable to the deployment (or switch providers in the Super Admin panel), then redeploy.` };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { reply: "", actions: [], error: "Not authenticated." };

  if (isOffTopic(history)) {
    return { reply: OFF_TOPIC_REPLY, actions: [] };
  }

  if (!(await canAfford(1))) {
    return { reply: "", actions: [], error: "You're out of AI credits for this billing cycle. Upgrade your plan for more." };
  }
  // Charged once per user message, regardless of how many internal tool round-trips
  // the model needs — matches how every other AI feature bills "one action, one credit".
  let charged = false;
  async function chargeOnce() {
    if (charged) return;
    charged = true;
    try {
      const res = await deductCredits("ai_assistant", 1, { metadata: { model } });
      if (!res.ok) console.error("[ai_assistant] credit deduct failed:", res.error);
    } catch (err) {
      console.error("[ai_assistant] credit deduct threw:", err);
    }
  }

  const trimmed = history.slice(-16);
  const systemPrompt = await buildSystemPrompt();

  interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
  type ApiMessage =
    | { role: "system" | "user" | "assistant"; content: string }
    | { role: "assistant"; content: string | null; tool_calls: ToolCall[] }
    | { role: "tool"; tool_call_id: string; content: string };

  const messages: ApiMessage[] = [
    { role: "system", content: systemPrompt },
    ...trimmed.map((m) => ({ role: m.role, content: m.content })),
  ];

  const actions: string[] = [];

  // Some Groq/Llama models embed function calls as text instead of using tool_calls.
  // Pattern: <function(name)\nJSON</function>
  function parseLlamaFunctionCalls(text: string): ToolCall[] {
    const calls: ToolCall[] = [];
    const pattern = /<function\((\w+)\)\s*([\s\S]*?)<\/function>/g;
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = pattern.exec(text)) !== null) {
      calls.push({ id: `embedded_${idx++}`, type: "function", function: { name: m[1], arguments: m[2].trim() } });
    }
    return calls;
  }

  function stripLlamaFunctionTags(text: string): string {
    return text.replace(/<function\(\w+\)\s*[\s\S]*?<\/function>/g, "").trim();
  }

  for (let turn = 0; turn < 6; turn++) {
    const res = await chatCompletion(apiKey, baseUrl, {
      model, messages, tools: TOOLS, tool_choice: "auto",
      parallel_tool_calls: false, temperature: 0.4, max_tokens: 1500,
    });

    if (!res.ok) {
      let detail = "";
      try {
        const parsed = JSON.parse(res.text);
        detail = parsed?.error?.message || parsed?.message || res.text.slice(0, 200);
      } catch { detail = res.text.slice(0, 200); }
      const friendly = res.status === 429
        ? "The AI provider is busy — please try again in a moment."
        : `AI error (${res.status}): ${detail || "unknown error"}`;
      return { reply: "", actions, error: friendly };
    }

    const msg = (res.data as { choices?: { message?: { content?: string; tool_calls?: ToolCall[] } }[] }).choices?.[0]?.message;
    if (!msg) return { reply: "", actions, error: "Empty AI response. Please try again." };

    // Prefer proper tool_calls; fall back to embedded Llama-style function tags in text
    const properCalls = msg.tool_calls ?? [];
    const embeddedCalls = properCalls.length === 0 ? parseLlamaFunctionCalls(msg.content || "") : [];
    const toolCalls: ToolCall[] = properCalls.length ? properCalls : embeddedCalls;
    // When using embedded calls, strip the function markup from the displayed content
    const displayContent = embeddedCalls.length > 0
      ? stripLlamaFunctionTags(msg.content || "")
      : (msg.content ?? null);

    if (toolCalls.length) {
      const writes: ProposedAction[] = [];
      const reads: ToolCall[] = [];
      for (const tc of toolCalls) {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(tc.function.arguments || "{}"); } catch { /* empty */ }
        if (DELETE_TOOLS.has(tc.function.name)) {
          // Delete operations disabled — skip silently
        } else if (WRITE_TOOLS.has(tc.function.name)) {
          writes.push({ tool: tc.function.name, args: parsed, summary: summarizeAction(tc.function.name, parsed) });
        } else {
          reads.push(tc);
        }
      }

      if (writes.length) {
        const intro = displayContent?.trim()
          || (writes.length === 1
            ? "I'm ready to make this change — approve it below to proceed."
            : `I'm ready to make ${writes.length} changes — approve them below to proceed.`);
        await chargeOnce();
        return { reply: intro, actions, proposal: writes };
      }

      // For proper tool_calls use original content; for embedded calls use stripped content
      messages.push({ role: "assistant", content: properCalls.length ? (msg.content ?? null) : (displayContent ?? null), tool_calls: toolCalls });
      for (const tc of reads) {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(tc.function.arguments || "{}"); } catch { /* empty */ }
        const result = await executeReadTool(tc.function.name, parsed);
        messages.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
      continue;
    }

    await chargeOnce();
    return { reply: msg.content || "Done.", actions };
  }

  await chargeOnce();
  return { reply: "I hit my action limit for one request — ask me to continue.", actions };
}

// ---------------------------------------------------------------------------
// Approval execution — runs ONLY when the admin clicks Approve.
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
    if (DELETE_TOOLS.has(action.tool)) {
      errors.push(`Delete operations are disabled in the AI assistant. Use the application interface instead.`);
      continue;
    }
    if (!WRITE_TOOLS.has(action.tool)) {
      errors.push(`Blocked unknown action "${action.tool}".`);
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
