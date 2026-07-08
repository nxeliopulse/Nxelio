"use server";
import { sendEmail } from "@/lib/email/resend";

/**
 * Direct signup that bypasses Resend's sandbox restriction on email confirmation.
 * Uses the Supabase auth admin REST API directly so the password is reliably
 * persisted (the SDK has been flaky on Next 16/Turbopack).
 */
export async function signUpDirect(args: { email: string; password: string; fullName: string }): Promise<{ ok: boolean; error?: string }> {
  // 1. Create the auth user (auto-confirmed)
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
      email_confirm: true,
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

  // 3. Courtesy notification to the Resend account owner
  const ownerEmail = process.env.EMAIL_TEST_RECIPIENT || "harirajanncse@gmail.com";
  try {
    await sendEmail({
      to: ownerEmail,
      subject: `New LeadPro signup — ${args.fullName}`,
      html: `<div style="font-family:sans-serif;line-height:1.6;color:#0f172a;padding:24px;background:#f8fafc">
        <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
          <h2 style="margin:0 0 16px;color:#0f172a">New LeadPro signup</h2>
          <p style="margin:0 0 4px"><strong>Name:</strong> ${escapeHtml(args.fullName)}</p>
          <p style="margin:0 0 4px"><strong>Email:</strong> ${escapeHtml(args.email)}</p>
          <p style="margin:0 0 4px"><strong>User ID:</strong> <code style="font-size:12px">${newUserId}</code></p>
          <p style="margin:16px 0 0;color:#64748b;font-size:13px">A fresh workspace was created. The user can log in immediately with the password they entered.</p>
        </div>
      </div>`,
    });
  } catch {
    // Swallow notification errors — signup itself should succeed regardless.
  }

  return { ok: true };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
