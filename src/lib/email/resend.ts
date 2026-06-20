import "server-only";

/**
 * Multi-provider email service. Tries, in order:
 *   1. Brevo  (BREVO_API_KEY + BREVO_FROM_EMAIL)  — free 300/day, verifies a
 *      plain email address as sender, NO custom domain required.
 *   2. Resend (RESEND_API_KEY)                    — needs a verified domain to
 *      reach real recipients; sandbox redirects to the test inbox.
 *   3. Dev simulation (no keys)                   — pretends the send succeeded
 *      so every app flow keeps working during development; the email body is
 *      printed to the server console.
 *
 * The module keeps its original path/exports so existing call sites
 * (lead emails, newsletters, outreach processor, OTP) need no changes.
 */

const BREVO_KEY = process.env.BREVO_API_KEY;
const BREVO_FROM_EMAIL = process.env.BREVO_FROM_EMAIL; // must be a verified sender in Brevo
const BREVO_FROM_NAME = process.env.BREVO_FROM_NAME || "LeadPro";
// Route replies to the mailbox connected to Unipile (so replies are captured),
// even when we send from a different verified Brevo sender.
const REPLY_TO_EMAIL = process.env.REPLY_TO_EMAIL;

const RESEND_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.EMAIL_FROM || "LeadPro <onboarding@resend.dev>";
const DOMAIN_VERIFIED = process.env.EMAIL_DOMAIN_VERIFIED === "true";
const TEST_RECIPIENT = process.env.EMAIL_TEST_RECIPIENT;

const brevoConfigured = Boolean(BREVO_KEY && BREVO_FROM_EMAIL);
const resendConfigured = Boolean(RESEND_KEY);

/** True when ANY real provider is available (dev simulation still works without). */
export const emailConfigured = brevoConfigured || resendConfigured;
/** Brevo's single-sender verification reaches real recipients without a domain. */
export const emailDomainVerified = brevoConfigured || DOMAIN_VERIFIED;

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
  redirectedTo?: string; // when sandboxed, the real recipient we fell back to
  provider?: "brevo" | "resend" | "simulated";
  simulated?: boolean;
}

interface SendArgs {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  /** Brevo tags — used to attribute open/click/bounce webhook events back to a campaign. */
  tags?: string[];
}

function toHtml(html?: string, text?: string): string {
  return (
    html ||
    `<div style="font-family:sans-serif;line-height:1.6;color:#0f172a">${(text || "").replace(/\n/g, "<br>")}</div>`
  );
}

async function sendViaBrevo({ to, subject, html, text, tags }: SendArgs): Promise<SendResult> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_KEY!,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: toHtml(html, text),
      ...(REPLY_TO_EMAIL ? { replyTo: { email: REPLY_TO_EMAIL } } : {}),
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

async function sendViaResend({ to, subject, html, text }: SendArgs): Promise<SendResult> {
  const realTo = to;
  let effectiveTo = to;
  let redirectedTo: string | undefined;

  // In sandbox mode, redirect any non-owner recipient to the test inbox
  if (!DOMAIN_VERIFIED && TEST_RECIPIENT && to.toLowerCase() !== TEST_RECIPIENT.toLowerCase()) {
    effectiveTo = TEST_RECIPIENT;
    redirectedTo = TEST_RECIPIENT;
  }

  const sandboxNote = redirectedTo
    ? `<div style="margin-top:24px;padding:12px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;font-family:sans-serif;font-size:12px;color:#92400e">⚠️ Sandbox mode: this email was intended for <b>${realTo}</b> but Resend has no verified domain yet, so it was redirected to your test inbox.</div>`
    : "";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM, to: effectiveTo, subject, html: toHtml(html, text) + sandboxNote }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = errText;
    try { msg = JSON.parse(errText).message || errText; } catch {}
    return { ok: false, error: `Resend: ${msg.slice(0, 280)}`, provider: "resend" };
  }
  const data = await res.json();
  return { ok: true, id: data.id, redirectedTo, provider: "resend" };
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  // 1. Brevo — free tier that reaches real recipients without a domain.
  if (brevoConfigured) {
    const r = await sendViaBrevo(args);
    if (r.ok) return r;
    // Brevo failed. Only fall back to Resend when it can actually deliver to the
    // REAL recipient (verified domain). Otherwise return Brevo's error — never
    // silently redirect to the sandbox test inbox, which misdelivers every mail.
    if (resendConfigured && DOMAIN_VERIFIED) return sendViaResend(args);
    return r;
  }

  // 2. Resend
  if (resendConfigured) {
    return sendViaResend(args);
  }

  // 3. Dev simulation — keep all flows working with zero config
  console.log(
    `\n📧 [DEV EMAIL — no provider configured]\nTo: ${args.to}\nSubject: ${args.subject}\n${(args.text || args.html || "").slice(0, 500)}\n`
  );
  return { ok: true, id: `dev_${Math.random().toString(36).slice(2, 10)}`, provider: "simulated", simulated: true };
}
