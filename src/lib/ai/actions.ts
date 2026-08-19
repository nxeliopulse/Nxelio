"use server";
import { aiChat, aiJson, aiConfigured } from "./client";
import { scanPrompt } from "@/lib/ai/security";
import { getLeadById, updateLead, getDistinctLeadValues } from "@/lib/queries/leads";
import { getOnboarding } from "@/lib/queries/onboarding";
import { NEWSLETTER_IMAGE_TOPICS, pickImageForTopic } from "@/lib/newsletter-image-topics";
import { canAfford, deductCredits } from "@/lib/queries/subscriptions";
import { getPicklistValues } from "@/lib/queries/picklists";
import { SEGMENT_FIELDS, operatorsForField, newGroup, newCondition, type Group, type RuleNode } from "@/lib/segments";
import { resolveRuleTree, explainRuleTree, type FieldMapping, type UnmappedItem } from "@/lib/ai/segment-resolver";
import { previewSegment } from "@/lib/queries/segments";
import { saveAiPromptHistory } from "@/lib/queries/ai-prompt-history";

export async function isAiConfigured() {
  return aiConfigured();
}

/** Blocks an AI call before it runs if the workspace can't afford this action's credit cost. */
async function assertCredits(amount = 1): Promise<void> {
  if (!(await canAfford(amount))) {
    throw new Error("You're out of AI credits for this billing cycle. Upgrade your plan for more.");
  }
}

/** Best-effort post-success deduction — a failure here shouldn't hide an AI result the user already paid API cost for. */
async function chargeCredits(operationType: string, amount = 1, options?: { leadId?: string; campaignId?: string }): Promise<void> {
  try {
    const res = await deductCredits(operationType, amount, options);
    if (!res.ok) console.error(`[ai/credits] deduct failed for ${operationType}:`, res.error);
  } catch (err) {
    console.error(`[ai/credits] deduct threw for ${operationType}:`, err);
  }
}

// ============================================================================
// AI Email Sequence Generation
// ============================================================================
export interface GeneratedEmail {
  day: string;
  subject: string;
  body: string;
  /** "email" (default) or "linkedin" — for multichannel sequence steps. */
  channel?: "email" | "linkedin";
  /** for LinkedIn steps: "connection_request" | "linkedin_message" */
  action?: "email" | "connection_request" | "linkedin_message";
}

export async function generateEmailSequence(goal: string, audience?: string): Promise<GeneratedEmail[]> {
  await assertCredits();
  const system = `You are an expert B2B sales copywriter. You write concise, personalized cold email sequences that get replies. Use merge tags like {{firstName}}, {{companyName}}, and {{industry}} where personalization helps. Keep each email under 120 words. Return ONLY valid JSON.`;

  const prompt = `Write a 3-step cold email sequence for this campaign goal: "${goal}"${audience ? `\nTarget audience: ${audience}` : ""}

Return JSON in exactly this shape:
{
  "emails": [
    { "day": "Day 1", "subject": "...", "body": "..." },
    { "day": "Day 3", "subject": "...", "body": "..." },
    { "day": "Day 7", "subject": "...", "body": "..." }
  ]
}`;

  const result = await aiJson<{ emails: GeneratedEmail[] }>({ system, prompt, temperature: 0.8 });
  await chargeCredits("email_sequence_generation", 1);
  return result.emails || [];
}

// ============================================================================
// AI Lead Scoring + Insights
// ============================================================================
export interface AiScoreResult {
  overallScore: number;
  dimensions: {
    companyFit: number;
    contactAccess: number;
    opportunityQuality: number;
    competitivePosition: number;
  };
  insight: string;
  outreachReadiness: "High" | "Medium" | "Low";
  expectedSalesCycle: string;
  nextSteps: { priority: "Now" | "This week" | "Watch"; action: string; impact: "High" | "Medium" | "Low" }[];
}

export async function scoreLeadWithAi(leadId: string): Promise<AiScoreResult> {
  await assertCredits();
  const [lead, { data: onboarding }] = await Promise.all([
    getLeadById(leadId),
    getOnboarding(),
  ]);
  if (!lead) throw new Error("Lead not found");

  // Build seller context from onboarding — makes companyFit & competitivePosition meaningful
  const sellerCtx = onboarding
    ? [
        `Seller (the company using this tool): ${onboarding.company_name}`,
        `  Industry: ${onboarding.industry}`,
        `  Target customer type: ${onboarding.target_customer_type}`,
        `  Primary product/service: ${onboarding.primary_product}`,
        onboarding.goals?.length ? `  Business goals: ${onboarding.goals.join(", ")}` : null,
        onboarding.key_competitors ? `  Key competitors: ${onboarding.key_competitors}` : null,
        onboarding.avg_deal_size ? `  Average deal size: ${onboarding.avg_deal_size}` : null,
        onboarding.sales_cycle ? `  Typical sales cycle: ${onboarding.sales_cycle}` : null,
        "",
        `Scoring guidance:`,
        `- companyFit: How well does this lead's industry/profile match ${onboarding.company_name}'s ideal customer (${onboarding.target_customer_type}, ${onboarding.industry} focus)?`,
        onboarding.key_competitors
          ? `- competitivePosition: Does anything about this lead suggest they are evaluating ${onboarding.key_competitors}? Higher displacement risk = lower score.`
          : `- competitivePosition: Is there any indication of competing vendors or low switching likelihood?`,
      ].filter(Boolean).join("\n")
    : `Seller context: a B2B sales team.`;

  const system = `You are an AI sales-intelligence engine. You evaluate B2B sales leads and return a structured score tailored to the seller's business profile. Be realistic and concise. Return ONLY valid JSON. Do NOT invent specific facts (exact revenue, funding, employee counts) — reason only from the data provided and general industry knowledge.`;

  const prompt = `Score this lead for the following seller.

${sellerCtx}

Lead data:
- Name: ${lead.full_name || "(company lead)"}
- Company: ${lead.company_name || "unknown"}
- Industry: ${lead.industry || "unknown"}
- Interest area: ${lead.interest_area || "unknown"}
- Source: ${lead.source || "unknown"}
- Current status: ${lead.status}
- Existing engagement score: ${lead.lead_score}/100
- Website: ${lead.website_url || "none"}

Return JSON in exactly this shape (all scores 0-100 integers):
{
  "overallScore": 0,
  "dimensions": { "companyFit": 0, "contactAccess": 0, "opportunityQuality": 0, "competitivePosition": 0 },
  "insight": "2-3 sentence analysis of buying intent and fit for this specific seller",
  "outreachReadiness": "High|Medium|Low",
  "expectedSalesCycle": "e.g. 30-45 days",
  "nextSteps": [
    { "priority": "Now|This week|Watch", "action": "specific recommended action", "impact": "High|Medium|Low" }
  ]
}`;

  const result = await aiJson<AiScoreResult>({ system, prompt, temperature: 0.5 });

  // Persist the score so it actually sticks on the lead (previously the AI score
  // was only shown on screen and never saved, leaving lead_score stuck at 0 —
  // which made "Lead Score" segment rules and dashboard "AI scored" useless).
  const score = Math.max(0, Math.min(100, Math.round(result.overallScore)));
  if (Number.isFinite(score)) {
    // Persist BOTH the headline number (for sorting/segments) and the full
    // breakdown (so the dimensions/insight/next-steps reload on the lead).
    try {
      await updateLead(leadId, { lead_score: score, ai_score: result });
    } catch {
      // ai_score column not present yet (migration 0027 not applied) — still
      // save the headline score so scoring keeps working.
      await updateLead(leadId, { lead_score: score });
    }
  }

  await chargeCredits("lead_scoring", 1, { leadId });
  return result;
}

// ============================================================================
// AI Company Intelligence (clearly labeled as AI estimate)
// ============================================================================
export interface AiCompanyIntel {
  estimatedType: string;
  estimatedSize: string;
  signals: { title: string; description: string; level: "Strong" | "Medium" | "Watch" }[];
  summary: string;
}

export async function generateCompanyIntel(leadId: string): Promise<AiCompanyIntel> {
  await assertCredits();
  const lead = await getLeadById(leadId);
  if (!lead) throw new Error("Lead not found");

  const system = `You are a B2B research assistant. Generate plausible company intelligence ESTIMATES based on the industry and company name. Be clear these are AI estimates, not verified facts. Return ONLY valid JSON.`;

  const prompt = `Generate estimated company intelligence for "${lead.company_name || "this company"}" in the ${lead.industry || "technology"} industry.

Return JSON:
{
  "estimatedType": "e.g. Private SaaS",
  "estimatedSize": "e.g. 50-200 employees",
  "signals": [
    { "title": "short signal", "description": "why it matters for sales", "level": "Strong|Medium|Watch" }
  ],
  "summary": "2 sentence strategic summary"
}`;

  const result = await aiJson<AiCompanyIntel>({ system, prompt, temperature: 0.6 });
  await chargeCredits("company_intel", 1, { leadId });
  return result;
}

// ============================================================================
// AI Contact Intelligence — likely decision-makers + strategy (estimates)
// ============================================================================
export interface AiContact {
  name: string;
  role: string;
  priority: "Primary" | "Secondary";
  insight: string;
  strategy: string;
  confidence: number;
}

export async function generateContactIntel(leadId: string): Promise<AiContact[]> {
  await assertCredits();
  const lead = await getLeadById(leadId);
  if (!lead) throw new Error("Lead not found");

  const system = `You are a B2B sales-research assistant. Suggest the likely key decision-makers (by ROLE) to target at a company, with engagement strategy. Use realistic placeholder names clearly understood as suggestions, NOT verified real people. Return ONLY valid JSON.`;

  const prompt = `For "${lead.company_name || "this company"}" in the ${lead.industry || "technology"} industry selling ${lead.interest_area || "a B2B SaaS solution"}, list the 3-4 most important roles to target.

Return JSON:
{
  "contacts": [
    { "name": "First Last (suggested)", "role": "e.g. Chief Revenue Officer", "priority": "Primary|Secondary", "insight": "why this role matters", "strategy": "how to engage them", "confidence": 70 }
  ]
}`;

  const result = await aiJson<{ contacts: AiContact[] }>({ system, prompt, temperature: 0.6 });
  await chargeCredits("contact_intel", 1, { leadId });
  return result.contacts || [];
}

// ============================================================================
// AI Outreach Sequence — personalized to a specific lead
// ============================================================================
export async function generateLeadOutreach(leadId: string, instruction?: string): Promise<GeneratedEmail[]> {
  await assertCredits();
  const lead = await getLeadById(leadId);
  if (!lead) throw new Error("Lead not found");

  const system = `You are an expert B2B sales copywriter. Write a short, highly personalized multi-step cold email sequence for ONE specific prospect. Keep each email under 110 words. Reference their company and interest area. Use {{firstName}} for the name. Return ONLY valid JSON.`;

  const prompt = `Write a 4-step outreach sequence for:
- Name: ${lead.full_name || "(decision maker)"}
- Company: ${lead.company_name || "unknown"}
- Industry: ${lead.industry || "unknown"}
- Interest: ${lead.interest_area || "unknown"}
- Source: ${lead.source || "unknown"}
${instruction ? `\nThe user gave this specific instruction for what the email(s) should say or focus on — follow it: "${instruction}"\n` : ""}
Return JSON:
{
  "emails": [
    { "day": "Day 1", "subject": "...", "body": "..." },
    { "day": "Day 3", "subject": "...", "body": "..." },
    { "day": "Day 5", "subject": "...", "body": "..." },
    { "day": "Day 8", "subject": "...", "body": "..." }
  ]
}`;

  const result = await aiJson<{ emails: GeneratedEmail[] }>({ system, prompt, temperature: 0.8 });
  await chargeCredits("lead_outreach_generation", 1, { leadId });
  return result.emails || [];
}

// ============================================================================
// AI Next Steps — richer prioritized recommendations
// ============================================================================
export interface AiNextStep {
  priority: "Now" | "This week" | "Next 2 weeks" | "Watch";
  title: string;
  description: string;
  impact: "High" | "Medium" | "Low";
}

export interface AiNextStepsResult {
  steps: AiNextStep[];
  decisionTimeline: string;
  bestContactWindow: string;
  likelyDealSize: string;
}

export async function generateNextSteps(leadId: string): Promise<AiNextStepsResult> {
  await assertCredits();
  const lead = await getLeadById(leadId);
  if (!lead) throw new Error("Lead not found");

  const system = `You are an AI sales strategist. Give prioritized, specific next actions for a sales rep working a lead, plus timing estimates. Return ONLY valid JSON.`;

  const prompt = `Recommend next steps for this lead:
- Name: ${lead.full_name || "(company lead)"}
- Company: ${lead.company_name || "unknown"}
- Industry: ${lead.industry || "unknown"}
- Interest: ${lead.interest_area || "unknown"}
- Status: ${lead.status}
- Engagement score: ${lead.lead_score}/100

Return JSON:
{
  "steps": [
    { "priority": "Now|This week|Next 2 weeks|Watch", "title": "short action title", "description": "1 sentence detail", "impact": "High|Medium|Low" }
  ],
  "decisionTimeline": "e.g. 30-45 days",
  "bestContactWindow": "e.g. Tue-Thu, 10am-12pm",
  "likelyDealSize": "e.g. $40k-$70k ARR"
}`;

  const result = await aiJson<AiNextStepsResult>({ system, prompt, temperature: 0.6 });
  await chargeCredits("next_steps_generation", 1, { leadId });
  return result;
}

// ============================================================================
// AI Newsletter Generation — produce a block-based, colorful newsletter from a goal
// ============================================================================
export interface AiNewsletterBlock {
  type: "heading" | "paragraph" | "image" | "cta" | "divider" | "banner" | "section";
  text?: string;
  url?: string;
  alt?: string;
  color?: string;
  textColor?: string;
  eyebrow?: string;
  heading?: string;
  quote?: string;
  imagePosition?: "top" | "left" | "right" | "none";
  ctaText?: string;
  ctaUrl?: string;
  ctaColor?: string;
  /**
   * For "image"/"section" blocks that want a photo: a topic keyword from the allowed
   * list instead of a URL (the model can't fetch real images). Resolved into a real,
   * working stock photo URL server-side and stripped before the block is used.
   */
  topic?: string;
}

export interface AiNewsletterResult {
  title: string;
  subject: string;
  preheader: string;
  blocks: AiNewsletterBlock[];
}

export async function generateNewsletter(goal: string, audience?: string): Promise<AiNewsletterResult> {
  await assertCredits();
  const system = `You are an expert newsletter designer and copywriter. You write engaging, valuable newsletter content AND lay it out using colorful, visually rich blocks — never a plain wall of text. Structure every newsletter as a mix of block types, matching the tone and color palette to the subject (e.g. a WhatsApp/messaging newsletter should read like a tech product update: punchy, modern, green/blue accents; a finance newsletter should feel trustworthy: navy/gold accents). Return ONLY valid JSON.`;

  const prompt = `Write a colorful, visually rich newsletter for this goal: "${goal}"${audience ? `\nTarget audience: ${audience}` : ""}

Block types you can use:
- "banner": a bold full-width colored strip. Fields: text, color (background hex), textColor (defaults white).
- "section": a colored card with an eyebrow label, heading, body text, and optionally an image, a pull quote, and its own CTA button. Fields: eyebrow, heading, text, color (background hex, use a soft/pastel tone), textColor (set to "#ffffff" only if color is dark), topic (photo keyword — see list below), imagePosition ("top" | "left" | "right" | "none"), quote, ctaText, ctaUrl, ctaColor.
- "heading": a plain section title. Field: text.
- "paragraph": body copy. Field: text. You may use **bold** and [link text](https://example.com) inline.
- "image": a full-width photo. Fields: alt, topic (see list below) instead of url.
- "cta": a standalone button. Fields: text, url, color.
- "divider": a horizontal rule, no fields.

For any "image" or "section" block that should show a photo, set "topic" to the single best match from this exact list — do not invent other values: ${NEWSLETTER_IMAGE_TOPICS.join(", ")}. Pick the topic whose real-world subject matter is closest to the newsletter's actual topic (e.g. a WhatsApp/messaging story → "communication" or "mobile"; a fundraising story → "finance"; a product launch → "technology" or "product").

Use 8-12 blocks total, and include AT LEAST one "banner" and at least two "section" blocks so the newsletter feels designed, not just typed. Vary the section background colors (don't reuse the same hex twice). Return JSON in this exact shape:
{
  "title": "Internal title (3-6 words)",
  "subject": "Email subject line that drives opens (under 60 chars)",
  "preheader": "Preview text shown after the subject (under 90 chars)",
  "blocks": [
    { "type": "banner", "text": "🚀 A punchy opening line", "color": "#2563eb", "textColor": "#ffffff" },
    { "type": "paragraph", "text": "Opening paragraph that hooks the reader, with a **bold** phrase for emphasis." },
    { "type": "section", "eyebrow": "Why it matters", "heading": "A compelling subheading", "text": "Body copy for this section.", "color": "#dbeafe", "topic": "communication", "imagePosition": "left", "ctaText": "Learn more", "ctaUrl": "https://example.com", "ctaColor": "#2563eb" },
    { "type": "divider" },
    { "type": "section", "eyebrow": "Another angle", "heading": "A second subheading", "text": "More body copy.", "color": "#fef3c7", "topic": "technology", "imagePosition": "top" },
    { "type": "paragraph", "text": "Closing paragraph" }
  ]
}`;

  const result = await aiJson<AiNewsletterResult>({ system, prompt, temperature: 0.8 });
  result.blocks = (result.blocks || []).map((b, i) => {
    if ((b.type === "image" || b.type === "section") && (b.topic || !b.url)) {
      const { topic, ...rest } = b;
      return { ...rest, url: pickImageForTopic(topic, i) };
    }
    return b;
  });
  await chargeCredits("newsletter_generation", 1);
  return result;
}

// ============================================================================
// Single email regeneration / improvement
// ============================================================================
export async function improveEmail(currentBody: string, instruction: string): Promise<string> {
  await assertCredits();
  const scan = scanPrompt(instruction);
  if (scan.blocked) throw new Error("This instruction can't be processed — please rephrase it.");
  const result = await aiChat({
    system: "You are an expert sales copywriter. Rewrite the email per the instruction. Keep merge tags like {{firstName}}. Return only the rewritten email body, no preamble.",
    prompt: `Current email:\n${currentBody}\n\nInstruction: ${scan.safeText}`,
    temperature: 0.7,
  });
  await chargeCredits("email_improvement", 1);
  return result;
}

// ============================================================================
// AI Compose — Inbox "AI draft" (fresh message or reply, from a free-text prompt)
// ============================================================================
export interface ComposeDraftContext {
  recipientEmail?: string;
  /** Set when drafting a reply — the thread being replied to. */
  replyingToName?: string;
  originalSubject?: string;
  originalBody?: string;
}

export async function generateComposeEmail(instruction: string, context?: ComposeDraftContext): Promise<{ subject: string; body: string }> {
  await assertCredits();
  const scan = scanPrompt(instruction);
  if (scan.blocked) throw new Error("This instruction can't be processed — please rephrase it.");
  const isReply = Boolean(context?.originalBody);
  const system = `You are an expert professional email writer inside a CRM inbox. Write clear, polite, concise business emails. ${isReply ? "You are drafting a REPLY — stay on-topic with the original message." : ""} Return ONLY valid JSON.`;

  const threadBlock = isReply
    ? `\nOriginal message from ${context?.replyingToName || "the sender"}, subject "${context?.originalSubject || ""}":\n"""${context?.originalBody}"""\n`
    : "";

  const prompt = `${threadBlock}Write ${isReply ? "a reply" : "an email"} based on this instruction: "${scan.safeText || "Write a clear, friendly, professional email"}"${context?.recipientEmail ? `\nRecipient: ${context.recipientEmail}` : ""}

Return JSON in exactly this shape:
{ "subject": "...", "body": "..." }`;

  const result = await aiJson<{ subject: string; body: string }>({ system, prompt, temperature: 0.7 });
  await chargeCredits("email_generation", 1);
  return result;
}

// ============================================================================
// AI Builder — natural language → Segmentation Builder rule tree
// ============================================================================
export interface SegmentRuleGenerationResult {
  /** The FINAL rule — every value in here has been checked against this
   *  workspace's real data by the metadata resolver, never trusted from the
   *  model directly. */
  rule: Group;
  /** 0-100. Lowered automatically when anything couldn't be mapped. */
  confidence: number;
  /** Per-condition mapping breakdown — what matched, and how (exact/synonym/fuzzy). */
  mappings: FieldMapping[];
  /** Everything that could NOT be turned into a real condition, each with a
   *  reason — covers both fields/values the model flagged itself and values
   *  the resolver rejected because they don't exist in this workspace. */
  unmapped: UnmappedItem[];
  /** Plain-English bullets generated from the FINAL resolved rule tree, not
   *  from the raw model response. */
  explanation: string[];
  /** Real count from previewSegment() against the final resolved rule. */
  estimatedAudienceSize: number;
  /** True when anything is unmapped or confidence is low — the UI should
   *  call this out, but every generation always requires an explicit Apply
   *  click regardless, never auto-applied. */
  requiresReview: boolean;
}

const SEGMENT_RULE_CONFIDENCE_THRESHOLD = 70;

/** Recursively keeps only nodes that reference a real field/operator this
 *  evaluator actually supports — the model is instructed not to invent one,
 *  but this is the enforcement, not just the instruction. */
function sanitizeRuleNode(node: unknown): RuleNode | null {
  if (!node || typeof node !== "object") return null;
  const n = node as Record<string, unknown>;
  if (n.type === "group") {
    const op = n.operator;
    if (op !== "ALL" && op !== "ANY" && op !== "NOT") return null;
    const children = Array.isArray(n.children)
      ? (n.children.map(sanitizeRuleNode).filter((c): c is RuleNode => c !== null))
      : [];
    if (!children.length) return null;
    return newGroup(op, children);
  }
  if (n.type === "condition") {
    const field = String(n.field ?? "");
    if (!SEGMENT_FIELDS.some((f) => f.key === field)) return null;
    const operator = String(n.operator ?? "");
    if (!operatorsForField(field).some((o) => o.key === operator)) return null;
    const value = n.value == null ? "" : String(n.value).trim();
    if (!value) return null;
    return newCondition(field, operator, value);
  }
  return null;
}

export async function generateSegmentRules(prompt: string): Promise<SegmentRuleGenerationResult> {
  await assertCredits();
  const scan = scanPrompt(prompt);
  if (scan.blocked) throw new Error("This request can't be processed — please rephrase it.");
  const safePrompt = scan.safeText;

  // A live field catalog — real fields, real operators, and real vocabulary
  // (picklist / distinct values already on leads) — so the model is grounded
  // in what this workspace's data actually looks like, not just field names.
  const catalogLines = await Promise.all(
    SEGMENT_FIELDS.map(async (f) => {
      const ops = operatorsForField(f.key).map((o) => o.key).join(", ");
      let values = "";
      if (f.options?.kind === "picklist") {
        const v = await getPicklistValues(f.options.key).catch(() => []);
        if (v.length) values = ` — for reference only, e.g.: ${v.slice(0, 25).join(", ")}`;
      } else if (f.options?.kind === "distinct") {
        const v = await getDistinctLeadValues(f.key as "source" | "country").catch(() => []);
        if (v.length) values = ` — for reference only, e.g.: ${v.slice(0, 25).join(", ")}`;
      }
      return `- ${f.key} (${f.label}, type: ${f.type}) — operators: ${ops}${values}`;
    })
  );

  const system = `You convert a plain-English audience description into a structured segmentation rule tree for a CRM. You may ONLY use the fields and operators listed below — never invent a field or operator that isn't listed. Return ONLY valid JSON, no prose, no markdown fences.

Rules you must follow:
1. "OR" phrasing ("X or Y") must become a nested ANY group, never multiple conditions on the same field directly inside an ALL group — a lead cannot have two different values for the same field at once, so "industry = A AND industry = B" in the same ALL group can never match anything. Put those inside a nested ANY group instead.
2. The numeric "between" operator and date-range values take "value" formatted as "a|b" (e.g. "20|200" or "2026-01-01|2026-03-01"). Always use "between" (not two separate before/after conditions) when the user gives an explicit range like "between X and Y". "in_last_days" takes a plain integer number of days as "value". Date values are ISO "YYYY-MM-DD".
3. If the request mentions something with no reasonable match among the fields below, name the exact phrase in "unsupported" instead of forcing it onto an unrelated field. Never list something in "unsupported" if you already included a real condition for it — those two lists must never overlap.
4. Boolean fields ("is true"/"is false" operators) take no "value" — omit it or leave it empty.
5. CRITICAL — for any field with example values shown, put the user's OWN word or phrase in "value", exactly as they said it (e.g. "IT Services", "MSP", "Tech") — never substitute the closest-looking example from the list yourself, even if you're confident it's a better match. A separate system checks the value against the real data afterward; your job is only to extract what the user actually said, not to pre-correct it. Silently picking a different value than what the user typed is the single most important mistake to avoid.

Available fields:
${catalogLines.join("\n")}

Worked example — prompt: "Software or IT Services companies with AI Score above 20":
{
  "rule": { "type": "group", "operator": "ALL", "children": [
    { "type": "condition", "field": "lead_score", "operator": "gt", "value": "20" },
    { "type": "group", "operator": "ANY", "children": [
      { "type": "condition", "field": "industry", "operator": "contains", "value": "Software" },
      { "type": "condition", "field": "industry", "operator": "contains", "value": "IT Services" }
    ]}
  ]},
  "confidence": 90,
  "unsupported": []
}

Worked example — prompt: "Show leads created between July 1 and July 31, 2026":
{
  "rule": { "type": "group", "operator": "ALL", "children": [
    { "type": "condition", "field": "created_at", "operator": "between", "value": "2026-07-01|2026-07-31" }
  ]},
  "confidence": 90,
  "unsupported": []
}

Return JSON in exactly this shape:
{
  "rule": { "type": "group", "operator": "ALL", "children": [
    { "type": "condition", "field": "...", "operator": "...", "value": "..." }
  ]},
  "confidence": 0-100,
  "unsupported": ["any requested attribute not in the field list above, and not already covered by a condition"]
}`;

  const raw = await aiJson<{ rule: unknown; confidence?: number; unsupported?: string[] }>({
    system,
    prompt: `Convert this into a rule tree: "${safePrompt}"`,
    temperature: 0.3,
  });
  await chargeCredits("segment_rule_generation", 1);

  // Step 1 — structural sanitize: the model may ONLY reference real
  // fields/operators. This never trusts a value yet, just the shape.
  const sanitized = sanitizeRuleNode(raw.rule);
  const structurallyValid: Group = sanitized?.type === "group" ? sanitized : newGroup("ALL", sanitized ? [sanitized] : []);

  // Step 2 — metadata resolution: every remaining value is checked against
  // this workspace's real data (exact → synonym → fuzzy → unmapped). This is
  // the actual fix for the model substituting a real-but-wrong value.
  const { rule, mappings, unmapped: resolverUnmapped } = await resolveRuleTree(structurallyValid);

  // The model's own self-reported "couldn't map this at all" list — folded
  // into the same shape as the resolver's findings so the UI shows one list.
  const selfReportedUnmapped: UnmappedItem[] = (Array.isArray(raw.unsupported) ? raw.unsupported : [])
    .map(String)
    .filter((phrase) => !mappings.some((m) => m.displayValue.toLowerCase() === phrase.toLowerCase()))
    .map((phrase) => ({ requested: phrase, reason: "No field in this workspace represents this concept." }));

  const unmapped: UnmappedItem[] = [...resolverUnmapped, ...selfReportedUnmapped];

  // Step 3 — explain the FINAL rule (never the raw response) and get a real count.
  const explanation = hasAnyCondition(rule) ? explainRuleTree(rule) : [];
  const estimatedAudienceSize = hasAnyCondition(rule) ? (await previewSegment(rule).catch(() => null))?.matched ?? 0 : 0;

  const modelConfidence = typeof raw.confidence === "number" ? Math.max(0, Math.min(100, Math.round(raw.confidence))) : 50;
  // Confidence drops with every unmapped item — a generation that couldn't
  // place half the request shouldn't still claim to be 90% sure of itself.
  const confidence = unmapped.length ? Math.max(0, modelConfidence - unmapped.length * 15) : modelConfidence;

  await saveAiPromptHistory(prompt).catch(() => {});

  return {
    rule,
    confidence,
    mappings,
    unmapped,
    explanation,
    estimatedAudienceSize,
    requiresReview: confidence < SEGMENT_RULE_CONFIDENCE_THRESHOLD || unmapped.length > 0,
  };
}

function hasAnyCondition(node: RuleNode): boolean {
  return node.type === "condition" ? true : node.children.some(hasAnyCondition);
}
