"use server";
import { sendEmail } from "@/lib/email/resend";
import { sendVerificationCode } from "@/lib/queries/email-verification";

/**
 * Direct signup. Creates the auth account UNCONFIRMED — the user must enter the
 * 6-digit code emailed to them (see email-verification.ts) before Supabase will
 * let them sign in at all (it rejects password sign-in for unconfirmed accounts
 * with `email_not_confirmed`, which the login page catches and redirects on).
 * Uses the Supabase auth admin REST API directly so the password is reliably
 * persisted (the SDK has been flaky on Next 16/Turbopack).
 */
export async function signUpDirect(args: { email: string; password: string; fullName: string }): Promise<{ ok: boolean; error?: string }> {
  // 1. Create the auth user (unconfirmed — see verification flow above)
  const createRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: args.email,
      password: args.password,
      email_confirm: false,
      user_metadata: { full_name: args.fullName },
    }),
  });
  const createBody = await createRes.json();
  if (!createRes.ok) {
    return { ok: false, error: createBody.msg || createBody.error_description || "Signup failed" };
  }
  const newUserId: string = createBody.id;

  // 2. Defensively re-apply the password to guarantee it persists
  await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${newUserId}`, {
    method: "PUT",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: args.password }),
  }).catch(() => {});

  // 3. Courtesy notification to the workspace owner
  const ownerEmail = process.env.EMAIL_TEST_RECIPIENT || "harirajanncse@gmail.com";
  try {
    await sendEmail({
      to: ownerEmail,
      subject: `New Nxelio Nurture signup — ${args.fullName}`,
      html: `<div style="font-family:sans-serif;line-height:1.6;color:#0f172a;padding:24px;background:#f8fafc">
        <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
          <h2 style="margin:0 0 16px;color:#0f172a">New Nxelio Nurture signup</h2>
          <p style="margin:0 0 4px"><strong>Name:</strong> ${escapeHtml(args.fullName)}</p>
          <p style="margin:0 0 4px"><strong>Email:</strong> ${escapeHtml(args.email)}</p>
          <p style="margin:0 0 4px"><strong>User ID:</strong> <code style="font-size:12px">${newUserId}</code></p>
          <p style="margin:16px 0 0;color:#64748b;font-size:13px">A fresh workspace was created. The user still needs to verify their email before they can log in.</p>
        </div>
      </div>`,
    });
  } catch {
    // Swallow notification errors — signup itself should succeed regardless.
  }

  // 4. Send the verification code — the user can't sign in until they enter it.
  const codeResult = await sendVerificationCode(args.email, args.fullName);
  if (!codeResult.ok) return { ok: false, error: codeResult.error || "Couldn't send the verification email" };

  return { ok: true };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
