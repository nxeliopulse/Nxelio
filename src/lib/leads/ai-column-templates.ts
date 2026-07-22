import { Briefcase, Building2, Mail, Sparkles, TrendingUp, MessageSquareText, Globe2, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AiColumnOutputType = "text" | "number" | "email" | "url" | "boolean";
export type AiColumnTemplateCategory = "Enrichment" | "Scoring" | "Outreach" | "Research";

export interface AiColumnTemplate {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  category: AiColumnTemplateCategory;
  outputType: AiColumnOutputType;
  promptTemplate: string;
}

export const AI_COLUMN_TEMPLATE_CATEGORIES: ("All" | AiColumnTemplateCategory)[] = [
  "All", "Enrichment", "Scoring", "Outreach", "Research",
];

/** Fields any prompt template can reference with {{field}} — interpolated from the lead's own row. */
export const AI_COLUMN_VARIABLES = [
  "full_name", "email", "company_name", "industry", "interest_area",
  "website_url", "linkedin", "phone", "status", "source",
] as const;

export const aiColumnTemplates: AiColumnTemplate[] = [
  {
    id: "seniority-level",
    name: "Seniority level",
    description: "Classify the lead's seniority from their name, title context, and company.",
    icon: Briefcase,
    accent: "bg-blue-50 text-blue-600",
    category: "Enrichment",
    outputType: "text",
    promptTemplate: "Based on the lead's name \"{{full_name}}\" and company \"{{company_name}}\" in the {{industry}} industry, respond with only one word for their likely seniority: Junior, Mid, Senior, Director, VP, or C-Level. If you can't tell, respond \"Unknown\".",
  },
  {
    id: "company-size-guess",
    name: "Company size guess",
    description: "Estimate the employee headcount bracket for the lead's company.",
    icon: Building2,
    accent: "bg-violet-50 text-violet-600",
    category: "Enrichment",
    outputType: "text",
    promptTemplate: "Given the company \"{{company_name}}\" (website: {{website_url}}, industry: {{industry}}), respond with only one bracket for its likely employee count: 1-10, 11-50, 51-200, 201-1000, or 1000+. If unknown, respond \"Unknown\".",
  },
  {
    id: "personalized-icebreaker",
    name: "Personalized icebreaker",
    description: "A one-line, natural opener for the first outreach email.",
    icon: MessageSquareText,
    accent: "bg-emerald-50 text-emerald-600",
    category: "Outreach",
    outputType: "text",
    promptTemplate: "Write ONE short, natural icebreaker sentence (under 25 words, no greeting, no sign-off) for a cold email to {{full_name}} at {{company_name}} ({{industry}}). Reference their company or industry specifically. No generic flattery.",
  },
  {
    id: "fit-score",
    name: "ICP fit score (1-10)",
    description: "How well this lead matches a typical ideal customer profile.",
    icon: TrendingUp,
    accent: "bg-amber-50 text-amber-600",
    category: "Scoring",
    outputType: "number",
    promptTemplate: "Rate how well this lead fits a B2B SaaS ideal customer profile on a scale of 1-10, considering: company \"{{company_name}}\", industry \"{{industry}}\", interest area \"{{interest_area}}\". Respond with ONLY the number, nothing else.",
  },
  {
    id: "domain-from-company",
    name: "Likely company domain",
    description: "Guess the company's website domain when only the name is known.",
    icon: Globe2,
    accent: "bg-cyan-50 text-cyan-600",
    category: "Research",
    outputType: "url",
    promptTemplate: "Guess the most likely official website domain for the company \"{{company_name}}\" (industry: {{industry}}). Respond with ONLY the domain (e.g. example.com), nothing else. If you genuinely don't know, respond \"Unknown\".",
  },
  {
    id: "is-decision-maker",
    name: "Likely decision-maker?",
    description: "Yes/No guess at whether this contact can approve a purchase.",
    icon: ShieldCheck,
    accent: "bg-rose-50 text-rose-600",
    category: "Scoring",
    outputType: "boolean",
    promptTemplate: "Based on the name \"{{full_name}}\" and company \"{{company_name}}\", is this person likely a decision-maker who can approve a B2B purchase? Respond with ONLY \"Yes\" or \"No\".",
  },
  {
    id: "email-validity-guess",
    name: "Email deliverability guess",
    description: "Flags free-mail vs business-domain addresses as a quick sanity check.",
    icon: Mail,
    accent: "bg-slate-100 text-slate-600",
    category: "Enrichment",
    outputType: "text",
    promptTemplate: "Look at the email address \"{{email}}\". Respond with ONLY one word: \"Business\" if it's on a company/custom domain, \"Personal\" if it's a free provider (Gmail, Yahoo, Outlook, etc.), or \"Missing\" if there's no email.",
  },
];

export type AiColumnActionType = "ai_text" | "anysite_email";

/** Detects "find the verified email using anysite"-style instructions so the single free-text
 *  prompt box can route to a real AnySite lookup instead of an LLM-generated guess. Client and
 *  server both call this on the same prompt text, so detection never disagrees between them. */
export function detectAiColumnActionType(promptText: string): AiColumnActionType {
  const t = promptText.toLowerCase();
  return t.includes("anysite") && t.includes("email") ? "anysite_email" : "ai_text";
}

export function buildAiColumnPrompt(template: string, lead: Record<string, unknown>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const v = lead[key];
    return v === null || v === undefined || v === "" ? "(unknown)" : String(v);
  });
}

export const AI_COLUMN_OUTPUT_TYPE_LABELS: Record<AiColumnOutputType, string> = {
  text: "Text",
  number: "Number",
  email: "Email",
  url: "URL / Domain",
  boolean: "Yes / No",
};

export { Sparkles as AiColumnIcon };
