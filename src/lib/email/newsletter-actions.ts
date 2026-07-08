"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "./resend";
import { substituteMergeTags } from "./merge-tags";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { revalidatePath } from "next/cache";
import type { NewsletterBlock, NewsletterContent, NewsletterRow } from "@/lib/queries/newsletters";

/**
 * Renders newsletter content blocks into a polished HTML email.
 */
function renderNewsletterHtml(content: NewsletterContent, opts: { subject?: string; preheader?: string }): string {
  const blocks = content.blocks || [];
  const blockHtml = blocks
    .map((b: NewsletterBlock) => {
      switch (b.type) {
        case "heading":
          return `<h1 style="margin:24px 0 12px;font-size:24px;color:#0f172a;font-weight:700;line-height:1.3">${escape(b.text || "")}</h1>`;
        case "paragraph":
          return `<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.7">${escape(b.text || "")}</p>`;
        case "cta":
          return `<div style="margin:24px 0;text-align:center"><a href="${escape(b.url || "#")}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">${escape(b.text || "Learn more")}</a></div>`;
        case "image":
          return b.url ? `<img src="${escape(b.url)}" alt="${escape(b.alt || "")}" style="max-width:100%;height:auto;border-radius:8px;margin:16px 0" />` : "";
        case "divider":
          return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />`;
        default:
          return "";
      }
    })
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escape(opts.subject || "")}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  ${opts.preheader ? `<div style="display:none;font-size:1px;color:#fff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escape(opts.preheader)}</div>` : ""}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc">
    <tr>
      <td align="center" style="padding:40px 16px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">
          <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #f1f5f9">
            <table role="presentation" width="100%"><tr>
              <td style="font-weight:700;font-size:18px;color:#0f172a">LeadPro</td>
              <td align="right" style="font-size:12px;color:#94a3b8">AI Engagement</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:32px">
            ${blockHtml}
          </td></tr>
          <tr><td style="padding:24px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;text-align:center">
            <p style="margin:0">You're receiving this because you subscribed to LeadPro updates.</p>
            <p style="margin:6px 0 0"><a href="#" style="color:#94a3b8;text-decoration:underline">Unsubscribe</a> · <a href="#" style="color:#94a3b8;text-decoration:underline">Preferences</a></p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface SendResult {
  ok: boolean;
  error?: string;
  total?: number;
  sent?: number;
  failed?: number;
  redirectedMessage?: string;
}

/**
 * Sends a newsletter to all subscribed leads (or members of a segment).
 * In Resend sandbox mode, only the owner email gets the actual delivery — we still
 * record all recipient rows to make analytics realistic.
 */
export async function sendNewsletter(newsletterId: string): Promise<SendResult> {
  const supabase = await createClient();
  const admin = createAdminClient();

  // 1. Fetch newsletter
  const { data: newsletter, error: nErr } = await supabase
    .from("newsletters")
    .select("*")
    .eq("id", newsletterId)
    .single();
  if (nErr || !newsletter) return { ok: false, error: "Newsletter not found" };

  const n = newsletter as NewsletterRow;

  // 2. Resolve recipients (admin client bypasses RLS so we hit all leads)
  let query = admin.from("leads").select("id, email, full_name, company_name, industry, interest_area").not("email", "is", null);
  if (n.audience_type === "segment" && n.segment_id) {
    const { data: members } = await admin.from("segment_members").select("lead_id").eq("segment_id", n.segment_id);
    const ids = (members || []).map((m: { lead_id: string }) => m.lead_id);
    if (!ids.length) return { ok: false, error: "Segment has no members" };
    query = query.in("id", ids);
  } else {
    // Only subscribed leads
    query = query.eq("is_subscribed", true);
  }
  const { data: leads } = await query;
  if (!leads || !leads.length) return { ok: false, error: "No subscribed recipients with email addresses" };

  // 3. Mark newsletter as Sending
  await supabase.from("newsletters").update({
    status: "Sending",
    recipient_count: leads.length,
  }).eq("id", n.id);

  // 4. Render and send
  let sent = 0;
  let failed = 0;
  let redirectedNote: string | undefined;

  for (const lead of leads) {
    if (!lead.email) continue;

    const personalizedContent = {
      blocks: (n.content.blocks || []).map((b: NewsletterBlock) => ({
        ...b,
        text: b.text ? substituteMergeTags(b.text, lead) : b.text,
      })),
    };
    const html = renderNewsletterHtml(personalizedContent, {
      subject: n.subject || n.title,
      preheader: n.preheader || undefined,
    });

    const finalSubject = substituteMergeTags(n.subject || n.title, lead);

    const result = await sendEmail({
      to: lead.email,
      subject: finalSubject,
      html,
    });

    if (result.ok) {
      sent++;
      if (result.redirectedTo && !redirectedNote) {
        redirectedNote = `Sandbox mode: delivered to ${result.redirectedTo} instead of real recipients`;
      }
      await admin.from("newsletter_recipients").insert({
        newsletter_id: n.id,
        lead_id: lead.id,
        email: lead.email,
        status: "sent",
        sent_at: new Date().toISOString(),
      });
    } else {
      failed++;
      await admin.from("newsletter_recipients").insert({
        newsletter_id: n.id,
        lead_id: lead.id,
        email: lead.email,
        status: "failed",
        error_message: result.error,
      });
    }
  }

  // 5. Update newsletter final state
  await supabase.from("newsletters").update({
    status: failed === leads.length ? "Failed" : "Sent",
    sent_at: new Date().toISOString(),
    sent_count: sent,
    // No tracking pixels yet — report honest zeros instead of invented numbers.
    open_count: 0,
    click_count: 0,
  }).eq("id", n.id);

  revalidatePath("/newsletters");
  revalidatePath(`/newsletters/builder`);

  // Real notification
  await notifyCurrentUser({
    type: "newsletter",
    title: `Newsletter "${n.title}" sent`,
    message: `Delivered to ${sent} of ${leads.length} recipients${failed ? ` (${failed} failed)` : ""}.`,
    link: "/newsletters",
  });

  return { ok: true, total: leads.length, sent, failed, redirectedMessage: redirectedNote };
}

/**
 * Sends a test newsletter to a specific email (no recipient logging).
 */
export async function sendTestNewsletter(newsletterId: string, testEmail: string): Promise<SendResult> {
  const supabase = await createClient();
  const { data: newsletter, error } = await supabase.from("newsletters").select("*").eq("id", newsletterId).single();
  if (error || !newsletter) return { ok: false, error: "Newsletter not found" };

  const n = newsletter as NewsletterRow;
  const fakeLead = { full_name: "Test Recipient", company_name: "Test Co", industry: "Technology", interest_area: "Demo", email: testEmail };
  const personalizedContent = {
    blocks: (n.content.blocks || []).map((b: NewsletterBlock) => ({
      ...b,
      text: b.text ? substituteMergeTags(b.text, fakeLead) : b.text,
    })),
  };
  const html = renderNewsletterHtml(personalizedContent, {
    subject: n.subject || n.title,
    preheader: n.preheader || undefined,
  });

  const result = await sendEmail({
    to: testEmail,
    subject: `[TEST] ${substituteMergeTags(n.subject || n.title, fakeLead)}`,
    html,
  });

  return result.ok
    ? { ok: true, sent: 1, redirectedMessage: result.redirectedTo ? `Sandbox: delivered to ${result.redirectedTo}` : undefined }
    : { ok: false, error: result.error };
}
