// Pure eligibility logic — no "use server", no DB access, so it stays
// synchronous (a "use server" file requires every export to be async) and
// can be reused for in-memory preview counts without a round-trip.

/** Minimal structural shape — works with LeadRow, StepLead, or any lead-like object. */
export interface EligibilityLead {
  email?: string | null;
  email_verification_status?: string | null;
  email_opt_out?: boolean | null;
  do_not_contact?: boolean | null;
  email_bounced?: boolean | null;
  linkedin?: string | null;
}

export type IneligibleReason =
  | "no_email"
  | "email_unverified"
  | "unsubscribed"
  | "do_not_contact"
  | "email_bounced"
  | "already_active_this_campaign"
  | "already_active_conflicting_campaign"
  | "recently_campaigned"
  | "missing_channel_contact";

export interface EligibilityResult {
  eligible: boolean;
  reasons: IneligibleReason[];
}

export interface CampaignEligibilityRules {
  requireVerifiedEmail?: boolean;
  channel?: "email" | "linkedin";
  /** Max campaigns this lead may be simultaneously active in (this campaign's own setting). */
  maxActivePerLead?: number;
  minDaysBetweenCampaigns?: number;
}

/** Pure per-lead check — no DB access, so it can be reused for a live preview count too. */
export function checkLeadEligibility(
  lead: EligibilityLead,
  rules: CampaignEligibilityRules = {}
): EligibilityResult {
  const reasons: IneligibleReason[] = [];
  const channel = rules.channel ?? "email";

  if (channel === "email" && !lead.email) reasons.push("no_email");
  if (channel === "linkedin" && !lead.linkedin) reasons.push("missing_channel_contact");
  if (rules.requireVerifiedEmail && lead.email_verification_status !== "valid") reasons.push("email_unverified");
  if (lead.email_opt_out) reasons.push("unsubscribed");
  if (lead.do_not_contact) reasons.push("do_not_contact");
  if (lead.email_bounced) reasons.push("email_bounced");

  return { eligible: reasons.length === 0, reasons };
}
