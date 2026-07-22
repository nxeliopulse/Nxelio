"use server";
import { resolveAiConfig } from "@/lib/ai/provider";

export interface IntegrationStatus {
  name: string;
  description: string;
  configured: boolean;
  maskedKey?: string;
  emoji: string;
}

function mask(key: string | undefined): string | undefined {
  if (!key) return undefined;
  if (key.length < 12) return "•••";
  return `${key.slice(0, 5)}${"•".repeat(20)}${key.slice(-4)}`;
}

export async function getIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const { apiKey, provider } = await resolveAiConfig();
  return [
    {
      name: `AI Provider (${provider === "groq" ? "Groq" : "OpenAI"})`,
      description: "Lead scoring + email generation — set in Admin > AI Provider",
      configured: Boolean(apiKey),
      maskedKey: mask(apiKey),
      emoji: "🤖",
    },
    {
      name: "Brevo (Email)",
      description: "Outbound transactional + campaign email",
      configured: Boolean(process.env.BREVO_API_KEY),
      maskedKey: mask(process.env.BREVO_API_KEY),
      emoji: "📧",
    },
    {
      name: "Supabase",
      description: "Database + Auth + Storage",
      configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      // Never expose any part of the service-role key to the browser — show a
      // non-revealing indicator only.
      maskedKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? "•••••••• (hidden)" : undefined,
      emoji: "🗄️",
    },
    {
      name: "HubSpot CRM",
      description: "Sync leads + campaigns",
      configured: Boolean(process.env.HUBSPOT_TOKEN),
      maskedKey: mask(process.env.HUBSPOT_TOKEN),
      emoji: "🟧",
    },
  ];
}

export async function getEmailDomainStatus() {
  const { emailProvider, emailDomainVerified, emailFromAddress } = await import("@/lib/email/resend");
  return {
    provider: emailProvider, // "brevo" | "none"
    verified: emailDomainVerified, // Brevo configured
    from: emailFromAddress || "—",
  };
}
