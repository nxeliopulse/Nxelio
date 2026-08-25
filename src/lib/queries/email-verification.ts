"use server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import crypto from "node:crypto";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function codeEmailHtml(code: string, fullName: string): string {
  return `<div style="font-family:sans-serif;line-height:1.6;color:#0f172a;padding:24px;background:#f8fafc">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e2e8f0">
      <div style="height:40px;width:40px;border-radius:12px;background:linear-gradient(135deg,#18A7B8,#7E57C2);margin-bottom:20px"></div>
      <h2 style="margin:0 0 8px;color:#0f172a;font-size:20px">Confirm your email address</h2>
      <p style="margin:0 0 24px;color:#64748b;font-size:14px">Hi ${fullName ? escapeHtml(fullName) : "there"}, enter this code to finish setting up your Nxelio Nurture account:</p>
      <div style="text-align:center;margin:0 0 24px">
        <span style="display:inline-block;font-size:32px;font-weight:800;letter-spacing:8px;color:#0d8fa0;background:#f0fdfb;padding:16px 24px;border-radius:12px;border:1.5px solid #b2ebf2">${code}</span>
      </div>
      <p style="margin:0;color:#94a3b8;font-size:12px">This code expires in ${CODE_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.</p>
    </div>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Looks up the auth user by email, generates a fresh 6-digit code, and emails it. */
export async function sendVerificationCode(email: string, fullName?: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const normalized = email.trim().toLowerCase();

  // Find the auth user by email — admin API lists users; filter client-side since
  // there's no direct get-by-email endpoint.
  const { data: userList, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return { ok: false, error: "Couldn't look up the account" };
  const user = userList.users.find((u) => (u.email || "").toLowerCase() === normalized);
  if (!user) return { ok: false, error: "No account found for that email" };
  if (user.email_confirmed_at) return { ok: false, error: "This account is already verified" };

  const code = generateCode();
  const { error: upsertError } = await admin
    .from("email_verification_codes")
    .upsert(
      { user_id: user.id, email: normalized, code_hash: hashCode(code), attempts: 0, expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString() },
      { onConflict: "user_id" }
    );
  if (upsertError) return { ok: false, error: "Couldn't generate a verification code" };

  const name = fullName ?? (user.user_metadata as { full_name?: string } | null)?.full_name ?? "";
  const res = await sendEmail({ to: normalized, subject: "Confirm your email — Nxelio Nurture", html: codeEmailHtml(code, name) });
  if (!res.ok) return { ok: false, error: "Couldn't send the verification email" };
  // No real email provider configured (local dev) — the shared dev-log truncates
  // the HTML before the code appears, so log it directly here for local testing.
  if ("simulated" in res && res.simulated) {
    console.log(`\n🔑 [DEV] Verification code for ${normalized}: ${code}\n`);
  }
  return { ok: true };
}

/** Verifies a submitted code and, on success, marks the Supabase auth account confirmed. */
export async function verifyEmailCode(email: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const normalized = email.trim().toLowerCase();

  const { data: row } = await admin.from("email_verification_codes").select("*").eq("email", normalized).maybeSingle();
  if (!row) return { ok: false, error: "No pending verification for this email — try resending the code" };
  if (new Date(row.expires_at) < new Date()) return { ok: false, error: "This code has expired — request a new one" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "Too many incorrect attempts — request a new code" };

  if (hashCode(code.trim()) !== row.code_hash) {
    await admin.from("email_verification_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return { ok: false, error: "Incorrect code" };
  }

  const { error: confirmError } = await admin.auth.admin.updateUserById(row.user_id, { email_confirm: true });
  if (confirmError) return { ok: false, error: "Verification succeeded but activating the account failed — please try logging in" };

  await admin.from("email_verification_codes").delete().eq("id", row.id);
  return { ok: true };
}
