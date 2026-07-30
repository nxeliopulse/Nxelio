import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfigured, aiJson } from "@/lib/ai/client";
import { unipileSendLinkedInMessage } from "@/lib/outreach/unipile";

const ASK_MESSAGE =
  "Great to hear you're interested! Could you share your email address and phone number so we can follow up with more details?";

/**
 * Classifies whether a LinkedIn reply expresses genuine positive interest
 * (not just a keyword match on "interested" — a real semantic read, so
 * "not interested", "interesting but no thanks", or an unrelated question
 * don't false-positive). Fails closed: any AI error is treated as "not
 * positive" rather than risking an unwanted auto-send.
 */
async function isPositiveReply(bodyText: string): Promise<boolean> {
  if (!bodyText.trim()) return false;
  try {
    const result = await aiJson<{ positive: boolean }>({
      system:
        "You classify inbound LinkedIn message replies for a B2B outreach tool. " +
        "Return ONLY JSON: {\"positive\": boolean}. " +
        "\"positive\" = true only when the message expresses genuine interest or agreement to move forward " +
        "(e.g. \"yes, interested\", \"sounds good\", \"let's talk\", \"sure, tell me more\", \"confirmed\"). " +
        "Return false for anything neutral, negative, a question, an out-of-office reply, or ambiguous small talk — " +
        "when in doubt, return false.",
      prompt: bodyText.slice(0, 1000),
      temperature: 0,
      maxTokens: 20,
    });
    return result.positive === true;
  } catch (err) {
    console.error("[auto-reply] classification failed, treating as not-positive:", err);
    return false;
  }
}

/**
 * When a lead replies to a LinkedIn message with genuine positive intent,
 * automatically sends one follow-up asking for their email/phone — so a
 * "yes I'm interested" doesn't just sit there until someone manually follows
 * up. Fires at most once per lead (contact_info_requested_at guards it), and
 * never throws — any failure here must not break the webhook it's called from.
 */
export async function maybeAutoRequestContactInfo(opts: {
  db: SupabaseClient;
  leadId: string;
  accountId: string;
  bodyText: string;
}): Promise<void> {
  const { db, leadId, accountId, bodyText } = opts;
  try {
    if (!(await aiConfigured())) return;

    const { data: lead } = await db
      .from("leads")
      .select("id, workspace_id, full_name, company_name, email, phone, linkedin_provider_id, contact_info_requested_at")
      .eq("id", leadId)
      .single();
    if (!lead) return;
    if (lead.contact_info_requested_at) return; // already asked once
    if (lead.email && lead.phone) return; // we already have both — nothing to ask for
    if (!lead.linkedin_provider_id) return; // can't message them without it

    if (!(await isPositiveReply(bodyText))) return;

    await unipileSendLinkedInMessage({
      accountId,
      providerId: lead.linkedin_provider_id,
      text: ASK_MESSAGE,
    });

    await db.from("leads").update({ contact_info_requested_at: new Date().toISOString() }).eq("id", lead.id);

    await db.from("inbox_messages").insert({
      workspace_id: lead.workspace_id,
      lead_id: lead.id,
      direction: "outbound",
      subject: "LinkedIn message",
      body: ASK_MESSAGE,
      is_read: true,
    });

    await db.from("lead_activities").insert({
      lead_id: lead.id,
      workspace_id: lead.workspace_id,
      activity_type: "LINKEDIN_AUTO_ASK_CONTACT_INFO",
      metadata: { trigger: "positive_reply_detected" },
    });
  } catch (err) {
    // Never let an auto-reply failure break the caller (the reply webhook).
    console.error("[auto-reply] maybeAutoRequestContactInfo failed:", err);
  }
}
