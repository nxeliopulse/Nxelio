"use server";
import { aiChat, aiJson, aiConfigured } from "./client";
import { getLeadById, updateLead } from "@/lib/queries/leads";

export async function isAiConfigured() {
  return aiConfigured;
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
  const lead = await getLeadById(leadId);
  if (!lead) throw new Error("Lead not found");

  const system = `You are an AI sales-intelligence engine. You evaluate B2B sales leads and return a structured score. Be realistic and concise. Return ONLY valid JSON. Do NOT invent specific facts (exact revenue, funding, employee counts) — reason only from the data provided and clearly general industry knowledge.`;

  const prompt = `Score this lead for a B2B AI/SaaS sales team.

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
  "insight": "2-3 sentence analysis of buying intent and fit",
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

  return aiJson<AiCompanyIntel>({ system, prompt, temperature: 0.6 });
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
  return result.contacts || [];
}

// ============================================================================
// AI Outreach Sequence — personalized to a specific lead
// ============================================================================
export async function generateLeadOutreach(leadId: string): Promise<GeneratedEmail[]> {
  const lead = await getLeadById(leadId);
  if (!lead) throw new Error("Lead not found");

  const system = `You are an expert B2B sales copywriter. Write a short, highly personalized multi-step cold email sequence for ONE specific prospect. Keep each email under 110 words. Reference their company and interest area. Use {{firstName}} for the name. Return ONLY valid JSON.`;

  const prompt = `Write a 4-step outreach sequence for:
- Name: ${lead.full_name || "(decision maker)"}
- Company: ${lead.company_name || "unknown"}
- Industry: ${lead.industry || "unknown"}
- Interest: ${lead.interest_area || "unknown"}
- Source: ${lead.source || "unknown"}

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

  return aiJson<AiNextStepsResult>({ system, prompt, temperature: 0.6 });
}

// ============================================================================
// AI Newsletter Generation — produce a block-based newsletter from a goal
// ============================================================================
export interface AiNewsletterBlock {
  type: "heading" | "paragraph" | "image" | "cta" | "divider";
  text?: string;
  url?: string;
  alt?: string;
}

export interface AiNewsletterResult {
  title: string;
  subject: string;
  preheader: string;
  blocks: AiNewsletterBlock[];
}

export async function generateNewsletter(goal: string, audience?: string): Promise<AiNewsletterResult> {
  const system = `You are an expert B2B newsletter writer. You write engaging, valuable newsletter content for subscribers. Structure it as a series of content blocks. Keep the tone helpful and conversational. Return ONLY valid JSON.`;

  const prompt = `Write a newsletter for this goal: "${goal}"${audience ? `\nTarget audience: ${audience}` : ""}

Return JSON in this exact shape (5-7 blocks total):
{
  "title": "Internal title (3-6 words)",
  "subject": "Email subject line that drives opens (under 60 chars)",
  "preheader": "Preview text shown after the subject (under 90 chars)",
  "blocks": [
    { "type": "heading", "text": "Main headline" },
    { "type": "paragraph", "text": "Opening paragraph that hooks the reader" },
    { "type": "paragraph", "text": "Body paragraph with value" },
    { "type": "cta", "text": "Read the full article", "url": "https://example.com" },
    { "type": "divider" },
    { "type": "paragraph", "text": "Closing paragraph" }
  ]
}`;

  return aiJson<AiNewsletterResult>({ system, prompt, temperature: 0.8 });
}

// ============================================================================
// Single email regeneration / improvement
// ============================================================================
export async function improveEmail(currentBody: string, instruction: string): Promise<string> {
  return aiChat({
    system: "You are an expert sales copywriter. Rewrite the email per the instruction. Keep merge tags like {{firstName}}. Return only the rewritten email body, no preamble.",
    prompt: `Current email:\n${currentBody}\n\nInstruction: ${instruction}`,
    temperature: 0.7,
  });
}
