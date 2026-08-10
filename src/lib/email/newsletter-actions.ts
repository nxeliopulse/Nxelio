"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "./resend";
import { substituteMergeTags } from "./merge-tags";
import { getOnboarding } from "@/lib/queries/onboarding";
import { notifyCurrentUser } from "@/lib/queries/notifications";
import { logAudit } from "@/lib/queries/audit-log";
import { canAfford, deductCredits } from "@/lib/queries/subscriptions";
import { revalidatePath } from "next/cache";
import type { NewsletterBlock, NewsletterContent, NewsletterRow } from "@/lib/queries/newsletters";

/** Credits charged per recipient for sending a newsletter (Bulk Email Campaign). */
const CREDITS_PER_NEWSLETTER_LEAD = 3;

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
          return `<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.7">${richText(b.text || "")}</p>`;
        case "cta":
          return `<div style="margin:24px 0;text-align:center"><a href="${escape(safeUrl(b.url))}" style="display:inline-block;padding:12px 24px;background:${escape(b.color || "#2563eb")};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">${escape(b.text || "Learn more")}</a></div>`;
        case "image": {
          const src = safeUrl(b.url);
          return src !== "#" ? `<img src="${escape(src)}" alt="${escape(b.alt || "")}" style="max-width:100%;height:auto;border-radius:8px;margin:16px 0" />` : "";
        }
        case "banner":
          return `<div style="background:${escape(b.color || "#2563eb")};color:${escape(b.textColor || "#ffffff")};padding:20px 24px;border-radius:10px;margin:0 0 20px;font-weight:700;font-size:16px;line-height:1.4">${escape(b.text || "")}</div>`;
        case "section":
          return renderSection(b);
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
              <td style="font-weight:700;font-size:18px;color:#0f172a">Nxelio Nurture</td>
              <td align="right" style="font-size:12px;color:#94a3b8">AI-Powered Lead Nurturing</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:32px">
            ${blockHtml}
          </td></tr>
          <tr><td style="padding:24px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;text-align:center">
            <p style="margin:0">You're receiving this because you subscribed to Nxelio Nurture updates.</p>
            <p style="margin:6px 0 0"><a href="#" style="color:#94a3b8;text-decoration:underline">Unsubscribe</a> · <a href="#" style="color:#94a3b8;text-decoration:underline">Preferences</a></p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Renders newsletter content to HTML for the builder's full-screen preview —
 * the exact same markup that sendNewsletter/sendTestNewsletter would deliver.
 */
export async function previewNewsletterHtml(content: NewsletterContent, opts: { subject?: string; preheader?: string }): Promise<string> {
  return renderNewsletterHtml(content, opts);
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Only allow safe link schemes — blocks javascript:/data: URLs in CTA/image blocks. */
function safeUrl(u?: string): string {
  const s = (u || "").trim();
  return /^(https?:|mailto:)/i.test(s) ? s : "#";
}

/** Escapes text, then applies lightweight **bold** and [label](url) markdown. */
function richText(s: string): string {
  const escaped = escape(s);
  const bolded = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return bolded.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label: string, url: string) => {
    return `<a href="${url}" style="color:#2563eb;text-decoration:underline;font-weight:600">${label}</a>`;
  });
}

/** Renders a colored "section" card — an eyebrow label, heading, body copy, optional image/quote/CTA. */
function renderSection(b: NewsletterBlock): string {
  const bg = escape(b.color || "#f1f5f9");
  const fg = b.textColor ? escape(b.textColor) : "#0f172a";
  const bodyFg = b.textColor ? escape(b.textColor) : "#334155";
  const eyebrow = b.eyebrow ? `<p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${fg};opacity:0.75">${richText(b.eyebrow)}</p>` : "";
  const heading = b.heading ? `<h2 style="margin:0 0 10px;font-size:20px;font-weight:800;color:${fg};line-height:1.3">${richText(b.heading)}</h2>` : "";
  const body = b.text ? `<div style="font-size:14px;color:${bodyFg};line-height:1.7">${richText(b.text)}</div>` : "";
  const quote = b.quote ? `<div style="margin-top:14px;padding:2px 0 2px 14px;border-left:3px solid ${fg};font-size:14px;color:${fg};font-style:italic">${richText(b.quote)}</div>` : "";
  const cta = b.ctaText
    ? `<div style="margin-top:14px"><a href="${escape(safeUrl(b.ctaUrl))}" style="display:inline-block;padding:10px 20px;background:${escape(b.ctaColor || "#e11d48")};color:#fff;text-decoration:none;border-radius:999px;font-weight:700;font-size:13px">${escape(b.ctaText)}</a></div>`
    : "";
  const imgSrc = safeUrl(b.url);
  const imgTag = imgSrc !== "#" ? `<img src="${escape(imgSrc)}" alt="${escape(b.alt || "")}" style="width:100%;max-width:100%;height:auto;border-radius:10px;display:block" />` : "";
  const textCol = `${eyebrow}${heading}${body}${quote}${cta}`;

  let inner: string;
  if ((b.imagePosition === "left" || b.imagePosition === "right") && imgTag) {
    const imgCell = `<td style="width:38%;vertical-align:top;${b.imagePosition === "left" ? "padding-right:16px" : "padding-left:16px"}">${imgTag}</td>`;
    const textCell = `<td style="vertical-align:top">${textCol}</td>`;
    inner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${b.imagePosition === "left" ? imgCell + textCell : textCell + imgCell}</tr></table>`;
  } else {
    inner = `${imgTag && b.imagePosition !== "none" ? `<div style="margin-bottom:14px">${imgTag}</div>` : ""}${textCol}`;
  }

  return `<div style="background:${bg};border-radius:14px;padding:24px;margin:0 0 20px">${inner}</div>`;
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
 * Without a configured Brevo sender, sends are simulated — we still record all
 * recipient rows to make analytics realistic.
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

  // 2. Resolve recipients with the RLS client so we ONLY ever reach the current
  //    workspace's leads (the admin client would leak/mail every tenant's leads).
  let query = supabase.from("leads").select("id, email, full_name, company_name, industry, interest_area").not("email", "is", null);
  if (n.audience_type === "segment" && n.segment_id) {
    const { data: members } = await supabase.from("segment_members").select("lead_id").eq("segment_id", n.segment_id);
    const ids = (members || []).map((m: { lead_id: string }) => m.lead_id);
    if (!ids.length) return { ok: false, error: "Segment has no members" };
    query = query.in("id", ids);
  } else {
    // Only subscribed leads
    query = query.eq("is_subscribed", true);
  }
  const { data: leads } = await query;
  if (!leads || !leads.length) return { ok: false, error: "No subscribed recipients with email addresses" };

  // AI-credit gate: a Bulk Email Campaign costs credits per recipient, same
  // "check before you spend" pattern used for AI features and sequence
  // campaigns — canAfford() also covers the subscription-expired case.
  if (!(await canAfford(CREDITS_PER_NEWSLETTER_LEAD * leads.length))) {
    return { ok: false, error: `You don't have enough AI credits to send this newsletter to ${leads.length} recipient${leads.length === 1 ? "" : "s"} (${CREDITS_PER_NEWSLETTER_LEAD} credits/lead). Upgrade your plan or wait for your next cycle.` };
  }

  // 3. Mark newsletter as Sending
  await supabase.from("newsletters").update({
    status: "Sending",
    recipient_count: leads.length,
  }).eq("id", n.id);

  // 4. Render and send
  const { data: onboarding } = await getOnboarding();
  const fromName = onboarding?.company_name?.trim() || "Nxelio Nurture";
  // Route replies to whichever mailbox is actually connected, not a stale env var.
  const { data: mailbox } = await supabase
    .from("outreach_accounts")
    .select("identifier, name")
    .eq("channel", "email")
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();
  // Unipile puts the real mailbox address in `name`, not `identifier` — see
  // the same fix in campaign-scheduler.ts's connectedEmailAddress().
  const replyTo = (mailbox?.identifier as string) || (mailbox?.name as string) || undefined;
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
      fromName,
      replyTo,
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

  // Best-effort post-send deduction — the emails have already gone out, so a
  // deduction failure here should never hide that from the caller (same
  // philosophy as chargeCredits() in ai/actions.ts).
  try {
    const res = await deductCredits("newsletter_send", CREDITS_PER_NEWSLETTER_LEAD * leads.length, { metadata: { newsletterId: n.id } });
    if (!res.ok) console.error("[newsletter-send/credits] deduct failed:", res.error);
  } catch (err) {
    console.error("[newsletter-send/credits] deduct threw:", err);
  }

  revalidatePath("/newsletters");
  revalidatePath(`/newsletters/builder`);

  // Real notification
  await notifyCurrentUser({
    type: "newsletter",
    title: `Newsletter "${n.title}" sent`,
    message: `Delivered to ${sent} of ${leads.length} recipients${failed ? ` (${failed} failed)` : ""}.`,
    link: "/newsletters",
  });
  await logAudit({
    action: "newsletter.sent",
    entityType: "newsletter",
    entityId: n.id,
    entityLabel: n.title,
    metadata: { total: leads.length, sent, failed },
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

  const { data: onboarding } = await getOnboarding();
  const { data: mailbox } = await supabase
    .from("outreach_accounts")
    .select("identifier, name")
    .eq("channel", "email")
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();
  const result = await sendEmail({
    to: testEmail,
    subject: `[TEST] ${substituteMergeTags(n.subject || n.title, fakeLead)}`,
    html,
    fromName: onboarding?.company_name?.trim() || "Nxelio Nurture",
    replyTo: (mailbox?.identifier as string) || (mailbox?.name as string) || undefined,
  });

  return result.ok
    ? { ok: true, sent: 1, redirectedMessage: result.redirectedTo ? `Sandbox: delivered to ${result.redirectedTo}` : undefined }
    : { ok: false, error: result.error };
}
