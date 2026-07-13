"use server";
import { findEmailByLinkedIn, anysiteConfigured } from "@/lib/leads/anysite";
import { updateLead } from "@/lib/queries/leads";

export interface EmailProviderStatus {
  id: "anysite" | "findymail" | "apollo" | "hunter";
  name: string;
  configured: boolean;
}

/** Which email-finder providers are actually wired up (have an API key) — drives the picker UI. */
export async function getEmailProviderStatuses(): Promise<EmailProviderStatus[]> {
  return [
    { id: "anysite", name: "AnySite", configured: anysiteConfigured },
    { id: "findymail", name: "Findymail", configured: Boolean(process.env.FINDYMAIL_API_KEY) },
    { id: "apollo", name: "Apollo", configured: Boolean(process.env.APOLLO_API_KEY) },
    { id: "hunter", name: "Hunter", configured: Boolean(process.env.HUNTER_API_KEY) },
  ];
}

/**
 * Looks up a lead's email via the chosen provider and saves it if found.
 * Only AnySite is actually wired up today — the others are placeholders until
 * their API keys are added (see getEmailProviderStatuses).
 */
export async function findLeadEmail(
  leadId: string,
  provider: EmailProviderStatus["id"],
  linkedinUrl: string | null
): Promise<{ ok: boolean; email?: string; error?: string }> {
  if (provider !== "anysite") {
    return { ok: false, error: "This provider isn't connected yet — add its API key first." };
  }
  if (!anysiteConfigured) {
    return { ok: false, error: "AnySite isn't configured. Add ANYSITE_API_KEY to your environment." };
  }
  if (!linkedinUrl) {
    return { ok: false, error: "This lead has no LinkedIn URL to look up." };
  }
  const result = await findEmailByLinkedIn(linkedinUrl);
  if (!result.ok || !result.email) {
    return { ok: false, error: result.error || "No email found for this profile." };
  }
  await updateLead(leadId, { email: result.email });
  return { ok: true, email: result.email };
}
