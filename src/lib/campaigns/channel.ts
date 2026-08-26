// Pure, dependency-free campaign-channel detection from raw step content.
// Kept separate from campaign-scheduler.ts's full step parser to avoid a
// circular import (campaign-scheduler.ts imports from enrollment.ts, which
// needs this too, to know which contact field a lead must have to enroll).
const LINKEDIN_STEP_HEADER = /\[li:(connection_request|linkedin_message|message)\]/i;

export type CampaignChannel = "email" | "linkedin" | "multichannel";

export function detectCampaignChannel(content: string | null): CampaignChannel {
  if (!content || !content.trim()) return "email";
  const blocks = content.split(/\n+\s*---\s*\n+/);
  let hasLinkedIn = false, hasEmail = false;
  for (const block of blocks) {
    const header = (block.trim().split("\n")[0] || "");
    if (LINKEDIN_STEP_HEADER.test(header)) hasLinkedIn = true;
    else hasEmail = true;
  }
  if (hasLinkedIn && hasEmail) return "multichannel";
  return hasLinkedIn ? "linkedin" : "email";
}
