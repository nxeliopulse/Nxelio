/**
 * ============================================================================
 * Phase 1 — Tool Definitions & Handlers (extracted from assistant.ts)
 * ============================================================================
 * Every AI tool the assistant can propose, described as a ToolDefinition and
 * backed by a handler. Descriptions and behavior are byte-identical to the
 * pre-Phase-1 switch statements in assistant.ts — this is a mechanical
 * extraction, not a behavior change. Permission metadata is DERIVED from
 * security.ts (TOOL_DOMAINS) so it can never drift from enforcement.
 *
 * Handler contract:
 * - Reads never throw — errors are embedded in the JSON string the model
 *   parses (exactly as before), so the model can explain failures itself.
 * - Writes throw ToolError on any failure (business validation, not found,
 *   provider) — the executor records it and surfaces a user-safe message.
 * - Successful creates return an undo hook so the RollbackManager can
 *   reverse them if the workflow is rejected mid-way.
 * ============================================================================
 */
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolResult,
} from "@/lib/ai/registry/types";
import { ToolError } from "@/lib/ai/executor/errors";
import { TOOL_DOMAINS } from "@/lib/ai/security";
import { createLead, getLeads, updateLead, deleteLead } from "@/lib/queries/leads";
import { createCampaign, getCampaigns, getCampaignStats, getCampaignById, updateCampaign, deleteCampaign } from "@/lib/queries/campaigns";
import { createSegment, getSegments, deleteSegment } from "@/lib/queries/segments";
import { flatRulesToTree } from "@/lib/segments";
import { createEmailTemplate, getEmailTemplates, deleteEmailTemplate } from "@/lib/queries/templates";
import { getNewsletters, deleteNewsletter } from "@/lib/queries/newsletters";
import { sendNewsletter } from "@/lib/email/newsletter-actions";
import { getUsers } from "@/lib/queries/users";
import { sendLeadEmail } from "@/lib/email/actions";
import { UI_ACTIONS, resolveUiAction } from "@/lib/ui-actions/registry";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse a campaign's stored email sequence back into steps. The stored format
 * (same one campaign-detail-view.tsx renders) is "Day N — Subject\nBody"
 * blocks separated by a line of "---". Missing " — " headers default to
 * "Day 1" with the whole first line as subject.
 */
function parseContentSteps(content: string | null): Array<{ day: string; subject: string; body: string }> {
  if (!content) return [];
  return content
    .split(/\n+\s*---\s*\n+/)
    .map((block) => {
      const lines = block.trim().split("\n");
      const header = lines[0] || "";
      const m = header.match(/^(.*?)\s+—\s+(.*)$/);
      return {
        day: m ? m[1].trim() : "Day 1",
        subject: m ? m[2].trim() : header.trim(),
        body: lines.slice(1).join("\n").trim(),
      };
    })
    .filter((s) => s.subject || s.body);
}

/** Read handlers keep the pre-Phase-1 contract: errors are JSON-embedded, never thrown. */
async function readResult(fn: () => Promise<string>): Promise<ToolResult> {
  try {
    return { ok: true, detail: await fn() };
  } catch (err) {
    return { ok: true, detail: JSON.stringify({ error: err instanceof Error ? err.message : "Tool failed" }) };
  }
}

/**
 * Auto-resolves a lead reference to a real database UUID — the model may pass
 * a name, an email, or a truncated/remembered id instead of the full UUID.
 * Returns null when nothing matches so callers report "not found" rather than
 * acting on the wrong lead. (Moved verbatim from assistant.ts.)
 */
export async function resolveLeadId(rawId: string, display?: string): Promise<string | null> {
  if (UUID_RE.test(rawId)) return rawId;
  const all = await getLeads();
  const searchTerm = (display || rawId).toLowerCase();
  const found =
    all.find((l) => l.id.startsWith(rawId)) ||
    all.find((l) => l.full_name?.toLowerCase() === searchTerm) ||
    all.find((l) => l.email?.toLowerCase() === rawId.toLowerCase()) ||
    all.find((l) => l.email?.toLowerCase() === searchTerm) ||
    all.find((l) => l.full_name?.toLowerCase().includes(searchTerm)) ||
    all.find((l) => searchTerm.includes(l.full_name?.toLowerCase() || ""));
  return found?.id ?? null;
}

const def = (
  t: Omit<ToolDefinition, "outputSchema" | "example" | "estimatedCost" | "estimatedMs"> & { estimatedMs?: number }
): ToolDefinition => ({
  outputSchema: { type: "object", description: `Output of ${t.id}`, properties: {} },
  example: { args: {}, description: "" },
  estimatedCost: { credits: 0 },
  ...t,
  estimatedMs: t.estimatedMs ?? 500,
});

// ---------------------------------------------------------------------------
// READ handlers (auto-executed)
// ---------------------------------------------------------------------------
const get_workspace_stats = def({
  id: "get_workspace_stats",
  name: "Get Workspace Stats",
  description: "Live workspace numbers: total/hot/converted leads and campaign stats.",
  whenToUse: "Any question about lead counts, hot/converted leads, or campaign activity at a glance.",
  whenNotToUse: "Questions about individual leads or campaigns — use search_leads/list_campaigns instead.",
  category: "analytics",
  mode: "read",
  approvalRequired: false,
  requiredPermissions: TOOL_DOMAINS.get_workspace_stats,
  params: [],
  progressLabel: "Reading workspace stats…",
  handler: async () =>
    readResult(async () => {
      const [leads, campaigns] = await Promise.all([getLeads(), getCampaignStats()]);
      return JSON.stringify({
        total_leads: leads.length,
        hot_leads: leads.filter((l) => l.status === "Hot").length,
        converted_leads: leads.filter((l) => l.status === "Converted").length,
        campaigns,
      });
    }),
});

const list_users = def({
  id: "list_users",
  name: "List Users",
  description: "List the workspace team: each member's name, email, role, status, and per-tab permission overrides. Use for any question about admins/users/roles/permissions.",
  whenToUse: "Questions about team members, roles, or permission overrides.",
  whenNotToUse: "Lead or campaign questions.",
  category: "people",
  mode: "read",
  approvalRequired: false,
  requiredPermissions: TOOL_DOMAINS.list_users,
  params: [],
  progressLabel: "Reading workspace team…",
  handler: async () =>
    readResult(async () => {
      const users = await getUsers();
      return JSON.stringify(users.map((u) => ({
        name: u.full_name, email: u.email, role: u.role_name, status: u.status,
        permission_overrides: u.nav_access && Object.keys(u.nav_access).length ? u.nav_access : "role defaults",
      })));
    }),
});

const search_leads = def({
  id: "search_leads",
  name: "Search Leads",
  description: "Search leads. Returns up to 10 matches with id, name, email, company, status, score.",
  whenToUse: "Finding a specific lead by name/email/company, filtering by status or industry.",
  whenNotToUse: "Workspace-wide aggregates — use get_workspace_stats.",
  category: "leads",
  mode: "read",
  approvalRequired: false,
  requiredPermissions: TOOL_DOMAINS.search_leads,
  params: [
    { key: "query", type: "string", description: "Matched against name, email, company", required: false },
    { key: "status", type: "string", description: "Filter by status", enum: ["New", "Warm", "Hot", "Scored", "Converted"], required: false },
    { key: "industry", type: "string", description: "Filter by industry", required: false },
  ],
  progressLabel: "Searching leads…",
  handler: async (args) =>
    readResult(async () => {
      const leads = await getLeads();
      const q = String(args.query || "").toLowerCase();
      const matches = leads.filter((l) => {
        const text = `${l.full_name || ""} ${l.email || ""} ${l.company_name || ""}`.toLowerCase();
        return (!q || text.includes(q))
          && (!args.status || l.status === args.status)
          && (!args.industry || (l.industry || "").toLowerCase() === String(args.industry).toLowerCase());
      }).slice(0, 10).map((l) => ({ id: l.id, name: l.full_name, email: l.email, company: l.company_name, status: l.status, score: l.lead_score }));
      return JSON.stringify({ count: matches.length, leads: matches });
    }),
});

const list_campaigns = def({
  id: "list_campaigns",
  name: "List Campaigns",
  description: "List campaigns with id, name, status, sent count.",
  whenToUse: "Questions about campaigns, or before updating/sending one (need the id).",
  whenNotToUse: "Lead-specific questions.",
  category: "campaigns",
  mode: "read",
  approvalRequired: false,
  requiredPermissions: TOOL_DOMAINS.list_campaigns,
  params: [],
  progressLabel: "Reading campaigns…",
  handler: async () =>
    readResult(async () => {
      const cs = await getCampaigns();
      return JSON.stringify(cs.map((c) => ({ id: c.id, name: c.campaign_name, status: c.status, sent: c.sent_count })));
    }),
});

const list_segments = def({
  id: "list_segments",
  name: "List Segments",
  description: "List audience segments with id, name, type, status.",
  whenToUse: "Questions about audience segments.",
  whenNotToUse: "Campaign or lead questions.",
  category: "segments",
  mode: "read",
  approvalRequired: false,
  requiredPermissions: TOOL_DOMAINS.list_segments,
  params: [],
  progressLabel: "Reading segments…",
  handler: async () =>
    readResult(async () => {
      const ss = await getSegments();
      return JSON.stringify(ss.map((s) => ({ id: s.id, name: s.segment_name, type: s.segment_type, status: s.status, contacts: s.contacts })));
    }),
});

const list_templates = def({
  id: "list_templates",
  name: "List Templates",
  description: "List email templates with id, name, subject.",
  whenToUse: "Questions about reusable email templates.",
  whenNotToUse: "Campaign or lead questions.",
  category: "templates",
  mode: "read",
  approvalRequired: false,
  requiredPermissions: TOOL_DOMAINS.list_templates,
  params: [],
  progressLabel: "Reading templates…",
  handler: async () =>
    readResult(async () => {
      const ts = await getEmailTemplates();
      return JSON.stringify(ts.map((t) => ({ id: t.id, name: t.template_name, subject: t.subject })));
    }),
});

const list_newsletters = def({
  id: "list_newsletters",
  name: "List Newsletters",
  description: "List newsletters with id, title, status (Draft/Sent/etc.), recipients and sent count.",
  whenToUse: "Questions about newsletters, or before sending one (need the id).",
  whenNotToUse: "Campaign or lead questions.",
  category: "newsletters",
  mode: "read",
  approvalRequired: false,
  requiredPermissions: TOOL_DOMAINS.list_newsletters,
  params: [],
  progressLabel: "Reading newsletters…",
  handler: async () =>
    readResult(async () => {
      const ns = await getNewsletters();
      return JSON.stringify(ns.map((n) => ({ id: n.id, title: n.title, status: n.status, recipients: n.recipient_count, sent: n.sent_count })));
    }),
});

// ---------------------------------------------------------------------------
// WRITE handlers (approval-gated — executed only after the admin approves)
// ---------------------------------------------------------------------------
const create_lead = def({
  id: "create_lead",
  name: "Create Lead",
  description: "[Needs approval] Create a lead. Requires a name or company, plus an email, website, or LinkedIn URL.",
  whenToUse: "User explicitly asks to add a new lead with real contact details.",
  whenNotToUse: "When contact details would have to be invented — ask the user first (anti-hallucination gate is enforced in code).",
  category: "leads",
  mode: "write",
  approvalRequired: true,
  requiredPermissions: TOOL_DOMAINS.create_lead,
  params: [
    { key: "full_name", type: "string", description: "Lead's full name", required: false },
    { key: "email", type: "string", description: "Email address (must be user-provided, never guessed)", required: false },
    { key: "company_name", type: "string", description: "Company name", required: false },
    { key: "industry", type: "string", description: "Industry", required: false },
    { key: "interest_area", type: "string", description: "Interest area", required: false },
    { key: "website_url", type: "string", description: "Website URL (must be user-provided, never guessed)", required: false },
    { key: "linkedin", type: "string", description: "LinkedIn URL (must be user-provided, never guessed)", required: false },
    { key: "phone", type: "string", description: "Phone number", required: false },
    { key: "twitter_handle", type: "string", description: "Twitter / X handle", required: false },
    { key: "job_title", type: "string", description: "Job title", required: false },
    { key: "company_size", type: "string", description: "Company size band", required: false },
    { key: "seniority", type: "string", description: "Seniority level", required: false },
    { key: "street_address", type: "string", description: "Street address", required: false },
    { key: "city", type: "string", description: "City", required: false },
    { key: "state", type: "string", description: "State", required: false },
    { key: "country", type: "string", description: "Country", required: false },
    { key: "postal_code", type: "string", description: "Postal code", required: false },
  ],
  progressLabel: "Creating lead…",
  summarize: (args) => {
    const name = args.full_name || args.company_name || "(no name provided)";
    const extras = [
      "email", "company_name", "industry", "interest_area", "phone", "website_url", "linkedin",
      "twitter_handle", "job_title", "company_size", "seniority",
      "street_address", "city", "state", "country", "postal_code",
    ]
      .filter((k) => k !== (args.full_name ? "full_name" : "company_name") && args[k])
      .map((k) => `${k.replace(/_/g, " ")}: ${args[k]}`)
      .join(", ");
    return `Create lead ${name}${extras ? ` — ${extras}` : ""}`;
  },
  handler: async (args) => {
    // Trim first so whitespace-only values (e.g. "   ") are treated as absent, not present.
    const fullName = typeof args.full_name === "string" ? args.full_name.trim() : "";
    const companyName = typeof args.company_name === "string" ? args.company_name.trim() : "";
    const email = typeof args.email === "string" ? args.email.trim() : "";
    const websiteUrl = typeof args.website_url === "string" ? args.website_url.trim() : "";
    const linkedin = typeof args.linkedin === "string" ? args.linkedin.trim() : "";

    if (!(fullName || companyName) || !(email || websiteUrl || linkedin)) {
      throw ToolError.validation("Lead needs a name/company AND an email, website, or LinkedIn URL.");
    }
    // Catches hallucinated/placeholder values (e.g. "person's email") that are non-empty
    // strings but not real emails — reject rather than silently saving garbage data.
    if (email && !EMAIL_PATTERN.test(email)) {
      throw ToolError.validation(`"${email}" doesn't look like a valid email address — please provide a real one.`);
    }
    const lead = await createLead({
      full_name: fullName || null, email: email || null,
      company_name: companyName || null, industry: (args.industry as string)?.trim() || null,
      interest_area: (args.interest_area as string)?.trim() || null, website_url: websiteUrl || null,
      linkedin: linkedin || null, phone: (args.phone as string)?.trim() || null,
      twitter_handle: (args.twitter_handle as string)?.trim() || null,
      job_title: (args.job_title as string)?.trim() || null,
      company_size: (args.company_size as string)?.trim() || null,
      seniority: (args.seniority as string)?.trim() || null,
      street_address: (args.street_address as string)?.trim() || null,
      city: (args.city as string)?.trim() || null,
      state: (args.state as string)?.trim() || null,
      country: (args.country as string)?.trim() || null,
      postal_code: (args.postal_code as string)?.trim() || null,
      source: "AI Assistant", status: "New",
    });
    return {
      ok: true,
      detail: `Created lead ${fullName || companyName} (id ${String(lead.id).slice(0, 8)}...)`,
      undo: {
        describe: `Delete created lead ${fullName || companyName}`,
        run: async () => {
          await deleteLead(String(lead.id));
          return "deleted";
        },
      },
    };
  },
});

const update_lead = def({
  id: "update_lead",
  name: "Update Lead",
  description: "[Needs approval] Update fields on a lead. Use search_leads first to get lead_id, and pass display = the lead's name.",
  whenToUse: "User asks to change a lead's status or contact details.",
  whenNotToUse: "Creating a new lead — use create_lead.",
  category: "leads",
  mode: "write",
  approvalRequired: true,
  requiredPermissions: TOOL_DOMAINS.update_lead,
  params: [
    { key: "lead_id", type: "string", description: "Lead id from search_leads", required: true },
    { key: "display", type: "string", description: "Lead's name for the approval card", required: true },
    // "Converted" deliberately excluded — that value is only ever set by the
    // real Convert flow (creates Account/Contact/Opportunity); letting the AI
    // set it here would fake a conversion with none of those records created.
    // updateLead() also rejects it server-side regardless (see status-flow.ts).
    { key: "status", type: "string", enum: ["New", "Contacted", "Qualified", "Nurturing"], required: false },
    { key: "full_name", type: "string", required: false },
    { key: "email", type: "string", required: false },
    { key: "company_name", type: "string", required: false },
    { key: "industry", type: "string", required: false },
    { key: "interest_area", type: "string", required: false },
    { key: "phone", type: "string", required: false },
  ],
  progressLabel: "Updating lead…",
  summarize: (args) => {
    const changes = ["status", "full_name", "email", "company_name", "industry", "interest_area", "phone"]
      .filter((k) => args[k] !== undefined).map((k) => `${k} -> ${args[k]}`).join(", ");
    return `Update lead ${args.display}: ${changes || "no changes"}`;
  },
  handler: async (args) => {
    const fields: Record<string, unknown> = {};
    for (const k of ["status", "full_name", "email", "company_name", "industry", "interest_area", "phone"]) {
      if (args[k] !== undefined) fields[k] = args[k];
    }
    if (!Object.keys(fields).length) throw ToolError.validation("No fields to update.");
    const leadId = await resolveLeadId(String(args.lead_id), args.display ? String(args.display) : undefined);
    if (!leadId) throw ToolError.notFound(`Lead "${args.display || args.lead_id}" not found in active leads list.`);
    await updateLead(leadId, fields);
    return {
      ok: true,
      detail: `Updated ${args.display}: ${Object.entries(fields).map(([k, v]) => `${k} -> ${v}`).join(", ")}`,
    };
  },
});

const create_campaign = def({
  id: "create_campaign",
  name: "Create Campaign",
  description: "[Needs approval] Create an email campaign (saved as Draft).",
  whenToUse: "User asks to start a new email campaign.",
  whenNotToUse: "Editing an existing campaign — use update_campaign.",
  category: "campaigns",
  mode: "write",
  approvalRequired: true,
  requiredPermissions: TOOL_DOMAINS.create_campaign,
  params: [
    { key: "campaign_name", type: "string", description: "Campaign name", required: true },
    { key: "subject", type: "string", description: "Email subject line", required: false },
    { key: "body", type: "string", description: "Email body content", required: false },
    { key: "segment_name", type: "string", description: "Name of the audience segment to target (created by create_segment). Resolved to the segment automatically.", required: false },
  ],
  progressLabel: "Creating campaign…",
  summarize: (args) => `Create draft campaign "${args.campaign_name}"`,
  handler: async (args) => {
    // Resolve a segment by name so a plan can link a campaign to a segment
    // created in the same approval batch (ids aren't known until it runs).
    let segmentId: string | null = null;
    if (args.segment_name) {
      const segments = await getSegments();
      const match = segments.find((s) => s.segment_name === args.segment_name) || segments.find((s) => s.segment_name.toLowerCase() === String(args.segment_name).toLowerCase());
      segmentId = match?.id ?? null;
    }
    const c = await createCampaign({
      campaign_name: String(args.campaign_name),
      subject: args.subject ? String(args.subject) : null,
      content: args.body ? String(args.body) : null,
      segment_id: segmentId,
      generated_by_ai: true,
    });
    const id = c?.id ? String(c.id) : null;
    return {
      ok: true,
      detail: `Created draft campaign "${args.campaign_name}" (id ${String(id ?? "?").slice(0, 8)}...)`,
      ...(id
        ? {
            undo: {
              describe: `Delete created campaign "${args.campaign_name}"`,
              run: async () => {
                await deleteCampaign(id);
                return "deleted";
              },
            },
          }
        : {}),
    };
  },
});

const update_campaign = def({
  id: "update_campaign",
  name: "Update Campaign",
  description: "[Needs approval] Update a campaign's name/subject/content/status, or APPEND follow-up steps to its email sequence. Use list_campaigns first; pass display = campaign name. To add steps (e.g. a Day 2 reminder), pass ONLY the new steps as an array of {subject, body} — existing steps are kept and day numbers are added automatically.",
  whenToUse: "User asks to edit an existing campaign's details, status, or add more emails to its sequence.",
  whenNotToUse: "Creating a new campaign — use create_campaign.",
  category: "campaigns",
  mode: "write",
  approvalRequired: true,
  requiredPermissions: TOOL_DOMAINS.update_campaign,
  params: [
    { key: "campaign_id", type: "string", description: "Campaign id from list_campaigns", required: true },
    { key: "display", type: "string", description: "Campaign name for the approval card", required: true },
    { key: "campaign_name", type: "string", required: false },
    { key: "subject", type: "string", required: false },
    { key: "content", type: "string", required: false },
    { key: "status", type: "string", enum: ["Draft", "Active", "Paused", "Completed"], required: false },
    {
      key: "steps", type: "array", required: false,
      description: "New follow-up email steps to APPEND to the campaign's sequence (Day 2, Day 3, …). Each step needs a subject and/or body.",
      arrayOf: {
        type: "object",
        itemFields: {
          subject: { key: "subject", type: "string", description: "Subject line for this step", required: false },
          body: { key: "body", type: "string", description: "Email body for this step", required: false },
        },
      },
    },
  ],
  progressLabel: "Updating campaign…",
  summarize: (args) =>
    Array.isArray(args.steps) && args.steps.length
      ? `Append ${args.steps.length} follow-up step${args.steps.length === 1 ? "" : "s"} to campaign "${args.display}"`
      : `Update campaign ${args.display}`,
  handler: async (args) => {
    // Resolve partial/truncated IDs the AI may have remembered from earlier messages.
    let campaignId = String(args.campaign_id);
    if (campaignId.length < 36) {
      const all = await getCampaigns();
      const found = all.find((c) => c.id.startsWith(campaignId)) || all.find((c) => c.campaign_name === String(args.display || ""));
      if (!found) throw ToolError.notFound(`Campaign "${args.display}" not found. Please use list_campaigns to confirm the ID.`);
      campaignId = found.id;
    }

    // Appending follow-up steps — read current sequence, append, re-serialize.
    if (Array.isArray(args.steps) && args.steps.length) {
      const existing = await getCampaignById(campaignId);
      const current = parseContentSteps(existing?.content ?? null);
      const added = (args.steps as Array<{ subject?: string; body?: string }>).map((s, i) => {
        const subject = String(s.subject ?? "").trim();
        const body = String(s.body ?? "").trim();
        if (!subject && !body) throw ToolError.validation(`Step ${i + 1} needs a subject or a body.`);
        return { day: `Day ${current.length + i + 1}`, subject, body };
      });
      const next = [...current, ...added].map((s) => `${s.day} — ${s.subject}\n${s.body}`).join("\n---\n");
      await updateCampaign(campaignId, { content: next });
      return {
        ok: true,
        detail: `Added ${added.length} step${added.length === 1 ? "" : "s"} to campaign "${args.display}": ${added.map((s) => s.subject).join(" | ")}`,
      };
    }

    const fields: Record<string, unknown> = {};
    for (const k of ["campaign_name", "subject", "content", "status"]) {
      if (args[k] !== undefined) fields[k] = args[k];
    }
    if (!Object.keys(fields).length) throw ToolError.validation("No fields to update.");
    await updateCampaign(campaignId, fields);
    return {
      ok: true,
      detail: `Updated campaign ${args.display}: ${Object.keys(fields).join(", ")}`,
    };
  },
});

const create_segment = def({
  id: "create_segment",
  name: "Create Segment",
  description: "[Needs approval] Create an audience segment with simple rules.",
  whenToUse: "User asks to build a new audience segment from lead attributes.",
  whenNotToUse: "Questions about existing segments — use list_segments.",
  category: "segments",
  mode: "write",
  approvalRequired: true,
  requiredPermissions: TOOL_DOMAINS.create_segment,
  params: [
    { key: "name", type: "string", description: "Segment name", required: true },
    { key: "description", type: "string", description: "Optional description", required: false },
    {
      key: "rules", type: "array", required: false,
      description: "Simple rule conditions (AND-combined)",
      arrayOf: {
        type: "object",
        requiredInItem: ["field", "operator", "value"],
        itemFields: {
          field: { key: "field", type: "string", description: "Lead attribute", required: true, enum: ["industry", "interest_area", "status", "lead_score", "source"] },
          operator: { key: "operator", type: "string", description: "Comparison", required: true, enum: ["equals", "contains", "greater_than", "less_than"] },
          value: { key: "value", type: "string", description: "Value to compare against", required: true },
        },
      },
    },
  ],
  progressLabel: "Creating segment…",
  summarize: (args) => `Create segment "${args.name}"`,
  handler: async (args) => {
    const rules = Array.isArray(args.rules)
      ? (args.rules as Array<{ field: string; operator: string; value: string }>).map((r) => ({
          field: r.field, operator: r.operator, value: r.value,
        }))
      : [];
    const segment = await createSegment(String(args.name), String(args.description || ""), "Dynamic", flatRulesToTree(rules, "AND"));
    const id = segment?.id ? String(segment.id) : null;
    return {
      ok: true,
      detail: `Created segment "${args.name}" with ${rules.length} rule${rules.length === 1 ? "" : "s"}`,
      ...(id
        ? {
            undo: {
              describe: `Delete created segment "${args.name}"`,
              run: async () => {
                await deleteSegment(id);
                return "deleted";
              },
            },
          }
        : {}),
    };
  },
});

const create_email_template = def({
  id: "create_email_template",
  name: "Create Email Template",
  description: "[Needs approval] Save a reusable email template. Supports {{firstName}}, {{companyName}} variables.",
  whenToUse: "User asks to save a reusable email template.",
  whenNotToUse: "One-off emails to a lead — use send_email_to_lead.",
  category: "templates",
  mode: "write",
  approvalRequired: true,
  requiredPermissions: TOOL_DOMAINS.create_email_template,
  params: [
    { key: "template_name", type: "string", description: "Template name", required: true },
    { key: "subject", type: "string", description: "Default subject line", required: true },
    { key: "body", type: "string", description: "Email body with {{firstName}}/{{companyName}} variables", required: true },
  ],
  progressLabel: "Saving template…",
  summarize: (args) => `Save template "${args.template_name}"`,
  handler: async (args) => {
    const tpl = await createEmailTemplate({ template_name: String(args.template_name), subject: String(args.subject), body: String(args.body) });
    const id = tpl?.id ? String(tpl.id) : null;
    return {
      ok: true,
      detail: `Saved template "${args.template_name}"`,
      ...(id
        ? {
            undo: {
              describe: `Delete created template "${args.template_name}"`,
              run: async () => {
                await deleteEmailTemplate(id);
                return "deleted";
              },
            },
          }
        : {}),
    };
  },
});

const send_email_to_lead = def({
  id: "send_email_to_lead",
  name: "Send Email to Lead",
  description: "[Needs approval] Send a real email to a lead. Use search_leads first; pass display = lead's name. The admin sees the recipient/subject before it sends.",
  whenToUse: "User explicitly asks to email a specific lead, with the content to send.",
  whenNotToUse: "Drafting content or asking for an email to be written — offer a template instead.",
  category: "leads",
  mode: "write",
  approvalRequired: true,
  requiredPermissions: TOOL_DOMAINS.send_email_to_lead,
  params: [
    { key: "lead_id", type: "string", description: "Lead id from search_leads", required: true },
    { key: "display", type: "string", description: "Lead's name for the approval card", required: true },
    { key: "subject", type: "string", description: "Email subject", required: true },
    { key: "body", type: "string", description: "Email body", required: true },
  ],
  progressLabel: "Sending email…",
  summarize: (args) => `Send email to ${args.display} — "${args.subject}"`,
  handler: async (args) => {
    const leadId = await resolveLeadId(String(args.lead_id), args.display ? String(args.display) : undefined);
    if (!leadId) throw ToolError.notFound(`Lead "${args.display || args.lead_id}" not found in active leads list.`);
    const res = await sendLeadEmail(leadId, String(args.subject), String(args.body));
    if (!res.ok) throw ToolError.provider(res.error || "Send failed");
    return { ok: true, detail: `Sent "${args.subject}" to ${args.display}` };
  },
});

const send_newsletter = def({
  id: "send_newsletter",
  name: "Send Newsletter",
  description: "[Needs approval] Send a newsletter to its subscribed audience now. Use list_newsletters first; pass display = newsletter title.",
  whenToUse: "User asks to send a specific newsletter to its audience now.",
  whenNotToUse: "Questions about newsletters — use list_newsletters.",
  category: "newsletters",
  mode: "write",
  approvalRequired: true,
  requiredPermissions: TOOL_DOMAINS.send_newsletter,
  params: [
    { key: "newsletter_id", type: "string", description: "Newsletter id from list_newsletters", required: true },
    { key: "display", type: "string", description: "Newsletter title for the approval card", required: true },
  ],
  progressLabel: "Sending newsletter…",
  summarize: (args) => `Send newsletter ${args.display} to its subscribed audience`,
  handler: async (args) => {
    const res = await sendNewsletter(String(args.newsletter_id));
    if (!res.ok) throw ToolError.provider(res.error || "Send failed");
    return {
      ok: true,
      detail: `Sent newsletter ${args.display} to ${res.sent ?? 0} recipient${res.sent === 1 ? "" : "s"}${res.redirectedMessage ? ` (${res.redirectedMessage})` : ""}`,
    };
  },
});

const send_contact_email = def({
  id: "send_contact_email",
  name: "Send Contact Email",
  description: "Email the Nxelio team at hello@nxelio.ai on the user's behalf. Use this ONLY when the user asks a pricing/plan/billing question that isn't covered by the pricing knowledge in your instructions, or when they explicitly ask to be connected with support/sales. Summarize their question or request clearly in the email body — never invent an answer instead of using this.",
  whenToUse: "Pricing/plan/billing questions beyond the built-in knowledge, or explicit requests to reach support/sales.",
  whenNotToUse: "Any question the built-in pricing knowledge covers — answer directly.",
  category: "communication",
  mode: "write",
  approvalRequired: true,
  requiredPermissions: TOOL_DOMAINS.send_contact_email,
  params: [
    { key: "subject", type: "string", description: "Short subject line summarizing the request", required: true },
    { key: "body", type: "string", description: "The message to send — summarize the user's question or request in their own words", required: true },
  ],
  progressLabel: "Contacting the team…",
  summarize: (args) => `Email hello@nxelio.ai — "${args.subject}"`,
  handler: async (args, ctx) => {
    const { sendEmail } = await import("@/lib/email/resend");
    const from = ctx.requesterEmail || "an Nxelio user";
    const res = await sendEmail({
      to: "hello@nxelio.ai",
      subject: `[AI Assistant] ${args.subject}`,
      text: `Message from ${from} via the in-app AI Assistant:\n\n${args.body}`,
      replyTo: ctx.requesterEmail || undefined,
    });
    if (!res.ok) throw ToolError.provider(res.error || "Send failed");
    return { ok: true, detail: `Emailed hello@nxelio.ai: "${args.subject}"` };
  },
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
const UI_ACTION_IDS = UI_ACTIONS.map((a) => a.id).join(", ");

/** Phase 2 — emits a UI action the client executes (navigate / open a
 *  pre-filled form modal). Nothing mutates until the user acts in the real UI,
 *  so this is auto-executed like a read. The loop intercepts the result and
 *  surfaces it to the chat widget as a clickable action card. */
const ui_action = def({
  id: "ui_action",
  name: "UI Action",
  description: `Ask the client UI to do something visible on screen. Use when the user says things like "go to my campaigns", "take me to analytics", "open the add lead form", "open the CSV import screen", "filter my prospects to new ones", "show me prospects". The user always stays in control — navigation just moves pages, modals open the real app form for the user to fill/save themselves, and filters apply to the table the user is looking at. Available action ids (never invent others): ${UI_ACTION_IDS}. IMPORTANT: when the user asks to open a form, import screen, or apply filters, emit this action IMMEDIATELY with only the details already provided — do NOT ask the user for missing or additional information first (no "what's their website?", no "could you provide more details?"). The form/filter UI itself is where they fill in the rest.`,
  whenToUse: "User asks to navigate somewhere in the app, or to open a form/flow (e.g. adding a lead) as a visible UI step.",
  whenNotToUse: "Data questions (use read tools) or actual data changes (use write tools via approval).",
  category: "ui",
  mode: "read",
  approvalRequired: false,
  requiredPermissions: TOOL_DOMAINS.ui_action,
  params: [
    { key: "action_id", type: "string", description: "One of the registered action ids", required: true },
    { key: "params", type: "object", description: "Action-specific parameters (e.g. {name, email, company} for open_lead_form)", required: false },
  ],
  progressLabel: "Preparing UI action…",
  handler: async (args) => {
    const call = resolveUiAction(args.action_id, args.params);
    if (!call) {
      return { ok: true, detail: JSON.stringify({ error: `Unknown UI action "${String(args.action_id)}" — choose from: ${UI_ACTION_IDS}` }) };
    }
    return { ok: true, detail: JSON.stringify({ ok: true, action: call }) };
  },
});

export const assistantTools: ToolDefinition[] = [
  // Reads (auto-executed)
  get_workspace_stats, list_users, search_leads,
  list_campaigns, list_segments, list_templates, list_newsletters,
  ui_action,
  // Writes (approval-gated)
  create_lead, update_lead,
  create_campaign, update_campaign,
  create_segment, create_email_template,
  send_email_to_lead, send_newsletter, send_contact_email,
];

/** Write tool ids — executed only after the admin approves. */
export const WRITE_TOOLS = new Set(
  assistantTools.filter((t) => t.mode === "write").map((t) => t.id)
);

/** Delete tool ids — COMPLETELY DISABLED (the assistant never calls them). */
export const DELETE_TOOLS = new Set([
  "delete_lead", "delete_campaign", "delete_segment",
  "delete_template", "delete_newsletter",
]);

/** Short human summary for the approval card. */
export function summarizeAction(name: string, args: Record<string, unknown>): string {
  const tool = assistantTools.find((t) => t.id === name);
  if (tool?.summarize) return tool.summarize(args);
  return name;
}
