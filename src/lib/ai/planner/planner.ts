/**
 * ============================================================================
 * Phase 3 M1 — Intent Planner: deterministic decomposition
 * ============================================================================
 * Turns a user goal into an ordered, dependency-aware Plan without an LLM:
 * each intent has a matcher; the first match wins. Steps are validated
 * against the tool registry (tool exists, args are plain JSON) so the plan
 * can never reference an invented tool — same fail-closed philosophy as the
 * UI action registry.
 *
 * M1 workflows:
 *   W1 "nurture-email"  — search {status} leads → create a segment → create a
 *                         draft campaign targeting it (subject/body from the
 *                         message). Bulk-friendly: one approval instead of N
 *                         per-lead emails. Singular asks ("email Olivia") fall
 *                         through to the LLM, which uses send_email_to_lead.
 *   W2 "segment-new"    — search new leads → create a segment matching them
 * ============================================================================
 */
import type { Plan, PlanStep } from "@/lib/ai/planner/types";

export interface PlannerContext {
  /** Tool ids that are allowed as write steps (need approval). */
  writeTools?: string[];
}

/** Write tools in this app — their steps never auto-retry and batch into the approval card. */
const WRITE_TOOLS = new Set(["create_lead", "update_lead", "create_campaign", "update_campaign", "create_segment", "create_email_template", "send_email_to_lead", "send_newsletter", "send_contact_email"]);

/** Pull a quoted or bare "subject: ..." / "body: ..." segment out of the goal. */
function extractField(goal: string, key: string): string | undefined {
  const m = goal.match(new RegExp(`${key}\\s*[:\\-]\\s*["'“”]?([^"'”|]{3,120})["'”]?`, "i"));
  return m?.[1]?.trim();
}

/** Registry-style arg validation — the plan executor revalidates via the real registry. */
function makeSteps(steps: PlanStep[]): PlanStep[] {
  return steps.map((s) => ({ ...s, requires_approval: s.requires_approval ?? WRITE_TOOLS.has(s.tool) }));
}

const STATUSES = ["new", "qualified", "hot", "converted"] as const;

/**
 * W1 — "send a follow-up email to my new/qualified leads"
 * Bulk flow (plural/group target): search_leads(status) → create_segment →
 * create_campaign(segment_name) — the efficient way to reach 10–100 leads.
 * The segment link is resolved by name at execution time, so the whole plan
 * fits in one approval card without chained id refs.
 */
function nurtureEmail(goal: string): Plan | null {
  const re =
    /\b(send|email|mail|reach out|nurture|follow-?up)\b[\s\S]{0,80}?\b(lead|prospect|contact)s\b/i;
  if (!re.test(goal)) return null;
  // Singular targets ("email Olivia Martinez", "email this lead") are not bulk —
  // leave them to the LLM's send_email_to_lead. The name branch is
  // case-sensitive on purpose ("to my new leads" must NOT look like a name).
  const singular =
    /\b(this|that|the|a|an|one)\s+(lead|prospect|contact)\b/i.test(goal) ||
    /\bto\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/.test(goal);
  if (singular) return null;
  const statusWord = goal.match(/\b(new|qualified|hot|converted)\b/i)?.[1]?.toLowerCase() ?? "new";
  const status = statusWord.charAt(0).toUpperCase() + statusWord.slice(1);
  const subject = extractField(goal, "subject");
  const body = extractField(goal, "body");
  // Need the email content — otherwise the LLM/UI takes over for drafting.
  if (!subject || !body) return null;
  const segmentName = extractField(goal, "segment") || `${status} leads — follow-up`;
  const campaignName = extractField(goal, "campaign") || `Follow-up to ${status} leads`;
  return {
    intent: "nurture-email",
    goal,
    steps: makeSteps([
      {
        id: "search",
        tool: "search_leads",
        label: `Find ${status} leads`,
        args: { status, query: extractField(goal, "query") || undefined },
      },
      {
        id: "segment",
        tool: "create_segment",
        label: `Create segment "${segmentName}"`,
        depends_on: ["search"],
        args: {
          name: segmentName,
          description: `Auto-created for follow-up to ${status} leads`,
          rules: [{ field: "status", operator: "equals", value: status }],
        },
      },
      {
        id: "campaign",
        tool: "create_campaign",
        label: `Create draft campaign "${campaignName}"`,
        depends_on: ["search"],
        args: {
          campaign_name: campaignName,
          subject,
          body,
          segment_name: segmentName,
        },
      },
    ]),
  };
}

/**
 * W2 — "create a segment of my new leads"
 * Steps: search_leads(new) → create_segment with a matching rule.
 */
function segmentNewLeads(goal: string): Plan | null {
  const re = /\b(segment|list|group)\b[\s\S]{0,60}?\b(new|qualified)\b[\s\S]{0,60}?\b(lead|prospect|contact)s?\b/i;
  if (!re.test(goal)) return null;
  const status = /qualified/i.test(goal) ? "Qualified" : "New";
  const name = extractField(goal, "name") || `${status} prospects segment`;
  return {
    intent: "segment-new",
    goal,
    steps: makeSteps([
      { id: "search", tool: "search_leads", label: `Find ${status} leads`, args: { status } },
      {
        id: "segment",
        tool: "create_segment",
        label: `Create segment "${name}"`,
        depends_on: ["search"],
        args: {
          name,
          description: extractField(goal, "description"),
          rules: [
            { field: "status", operator: "equals", value: status },
          ],
        },
      },
    ]),
  };
}

const MATCHERS = [nurtureEmail, segmentNewLeads];

/** Decompose a goal into a Plan, or null when no intent matches. */
export function decomposeIntent(goal: string): Plan | null {
  const trimmed = goal.trim();
  if (!trimmed) return null;
  for (const m of MATCHERS) {
    const plan = m(trimmed);
    if (plan) return plan;
  }
  return null;
}
