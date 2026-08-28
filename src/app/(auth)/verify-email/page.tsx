"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { sendVerificationCode, verifyEmailCode } from "@/lib/queries/email-verification";
import { createClient } from "@/lib/supabase/client";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 30;
// Must match the key signup/page.tsx writes to sessionStorage.
const PENDING_PASSWORD_KEY = "nxelio_pending_signup_password";

function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") || "";

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  function handleDigitChange(index: number, value: string) {
    const clean = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    setDigits([...pasted.split(""), ...Array(CODE_LENGTH - pasted.length).fill("")]);
    inputRefs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const code = digits.join("");
    if (code.length !== CODE_LENGTH) { setError("Enter the full 6-digit code"); return; }
    setError(null); setNotice(null); setVerifying(true);
    const result = await verifyEmailCode(email, code);
    if (!result.ok) {
      setVerifying(false);
      setError(result.error || "Verification failed");
      return;
    }

    // Sign the user straight into a real session using the password stashed
    // in sessionStorage at signup (never a URL param — that would leak into
    // browser history / referrer headers / server logs), then land them on
    // onboarding instead of bouncing back to the marketing page. Always
    // cleared right after reading, whether sign-in succeeds or not — it's
    // one-time-use, not meant to sit in storage longer than this step.
    let pendingPassword: string | null = null;
    try {
      pendingPassword = sessionStorage.getItem(PENDING_PASSWORD_KEY);
      sessionStorage.removeItem(PENDING_PASSWORD_KEY);
    } catch {}

    if (pendingPassword) {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: pendingPassword });
      setVerifying(false);
      if (!signInError) {
        router.push("/onboarding");
        return;
      }
      // Sign-in failed for some reason (password changed mid-flow, session
      // quirk) — fall through to the manual-login landing page below rather
      // than leaving the user stuck on a dead end.
    } else {
      setVerifying(false);
    }

    // No stashed password available (resumed this page in a fresh tab, or
    // the auto sign-in above failed) — same safe fallback as before.
    router.push(`/?verified=1&email=${encodeURIComponent(email)}`);
  }

  async function handleResend() {
    if (cooldown > 0 || !email) return;
    setError(null); setNotice(null); setResending(true);
    const result = await sendVerificationCode(email);
    setResending(false);
    if (!result.ok) { setError(result.error || "Couldn't resend the code"); return; }
    setNotice(`A new code was sent to ${email}.`);
    setCooldown(RESEND_COOLDOWN);
    setDigits(Array(CODE_LENGTH).fill(""));
    inputRefs.current[0]?.focus();
  }

  return (
    <div>
      <div className="flex justify-center mb-6">
        <div className="h-20 w-20 rounded-2xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,rgba(24,167,184,.18),rgba(126,87,194,.18))", border: "1.5px solid rgba(24,167,184,.3)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- self-animating SVG; Next/Image's optimizations don't apply to it */}
          <img src="/fingerprint-verification.svg" alt="Verifying" className="h-12 w-12" />
        </div>
      </div>

      <h1 className="text-2xl font-black text-white mb-2 text-center">Confirm your email address</h1>
      <p className="text-sm mb-8 text-center text-slate-400">
        For security, we&apos;ve sent a code to{" "}
        <span className="font-semibold text-slate-200">{email || "your email"}</span>.
        Enter it below to finish setting up your account.
      </p>

      <form onSubmit={handleVerify} className="space-y-5">
        {error && (
          <div className="flex items-start gap-2 rounded-xl p-3 text-sm"
            style={{ background: "rgba(244,81,30,.08)", border: "1.5px solid rgba(244,81,30,.25)", color: "#c2410c" }}>
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="flex items-start gap-2 rounded-xl p-3 text-sm"
            style={{ background: "rgba(24,167,184,.08)", border: "1.5px solid rgba(24,167,184,.25)", color: "#0d7d8c" }}>
            <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <div className="flex justify-center gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold text-white rounded-xl border border-white/15 focus:border-blue-400 focus:ring-4 focus:ring-blue-400/15 bg-white/[0.06] backdrop-blur-sm outline-none transition-all"
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={verifying || digits.join("").length !== CODE_LENGTH}
          className="w-full py-3.5 px-6 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.99] transition-all shadow-md shadow-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
        >
          {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {verifying ? "Verifying…" : "Verify email"}
        </button>

        <div className="text-center text-xs text-slate-400 font-medium">
          Haven&apos;t received the code?{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="font-bold text-blue-400 hover:text-blue-300 hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
          >
            {resending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </div>

        <p className="text-center text-xs pt-2 text-slate-400 font-medium">
          Wrong email?{" "}
          <Link href="/signup" className="font-bold text-blue-400 hover:text-blue-300 hover:underline">
            Sign up again
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="text-sm text-center py-8 text-slate-400">Loading…</div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
