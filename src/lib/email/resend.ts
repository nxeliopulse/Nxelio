import "server-only";

/**
 * Email service. Tries, in order:
 *   1. Brevo  (BREVO_API_KEY + BREVO_FROM_EMAIL)  — free 300/day, verifies a
 *      plain email address as sender, NO custom domain required.
 *   2. Dev simulation (no keys)                   — pretends the send succeeded
 *      so every app flow keeps working during development; the email body is
 *      printed to the server console.
 *
 * The module keeps its original path/exports so existing call sites
 * (lead emails, newsletters, outreach processor, OTP) need no changes.
 */

const BREVO_KEY = process.env.BREVO_API_KEY;
const BREVO_FROM_EMAIL = process.env.BREVO_FROM_EMAIL; // must be a verified sender in Brevo
const BREVO_FROM_NAME = process.env.BREVO_FROM_NAME || "Nxelio Nurture";
// Route replies to the mailbox connected to Unipile (so replies are captured),
// even when we send from a different verified Brevo sender.
const REPLY_TO_EMAIL = process.env.REPLY_TO_EMAIL;

const brevoConfigured = Boolean(BREVO_KEY && BREVO_FROM_EMAIL);

/** True when a real provider is available (dev simulation still works without). */
export const emailConfigured = brevoConfigured;
/** Brevo's single-sender verification reaches real recipients without a domain. */
export const emailDomainVerified = brevoConfigured;
/** Which provider sends in practice. */
export const emailProvider: "brevo" | "none" = brevoConfigured ? "brevo" : "none";
/** The verified "from" address real recipients will see. */
export const emailFromAddress: string | null = brevoConfigured ? BREVO_FROM_EMAIL! : null;

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
  redirectedTo?: string; // when sandboxed, the real recipient we fell back to
  provider?: "brevo" | "simulated";
  simulated?: boolean;
}

interface SendArgs {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  /** Brevo tags — used to attribute open/click/bounce webhook events back to a campaign. */
  tags?: string[];
  /** Sender display name recipients see. Per-workspace (e.g. the customer's company
   *  name); falls back to BREVO_FROM_NAME ("Nxelio") when not provided. */
  fromName?: string;
  /** Where replies should land. Callers should pass the workspace's actually-connected
   *  mailbox address when known — falls back to REPLY_TO_EMAIL only if omitted. */
  replyTo?: string;
}

function toHtml(html?: string, text?: string): string {
  return (
    html ||
    `<div style="font-family:sans-serif;line-height:1.6;color:#0f172a">${(text || "").replace(/\n/g, "<br>")}</div>`
  );
}

async function sendViaBrevo({ to, subject, html, text, tags, fromName, replyTo }: SendArgs): Promise<SendResult> {
  const effectiveReplyTo = replyTo || REPLY_TO_EMAIL;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_KEY!,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: (fromName && fromName.trim()) || BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: toHtml(html, text),
      // A plain-text alternative alongside the HTML body is a well-known
      // spam-score signal — HTML-only emails (no multipart fallback) are
      // one of the simplest heuristics spam filters use to flag mail.
      textContent: text || html?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      ...(effectiveReplyTo ? { replyTo: { email: effectiveReplyTo } } : {}),
      ...(tags && tags.length ? { tags } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = errText;
    try { msg = JSON.parse(errText).message || errText; } catch {}
    return { ok: false, error: `Brevo: ${msg.slice(0, 280)}`, provider: "brevo" };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: true, id: data.messageId, provider: "brevo" };
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  // 1. Brevo — free tier that reaches real recipients without a domain.
  if (brevoConfigured) {
    return sendViaBrevo(args);
  }

  // 2. Dev simulation — keep all flows working with zero config
  console.log(
    `\n📧 [DEV EMAIL — no provider configured]\nTo: ${args.to}\nSubject: ${args.subject}\n${(args.text || args.html || "").slice(0, 500)}\n`
  );
  return { ok: true, id: `dev_${Math.random().toString(36).slice(2, 10)}`, provider: "simulated", simulated: true };
}
