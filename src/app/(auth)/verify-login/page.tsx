"use client";
import { useEffect, useRef, useState, Suspense, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { sendLoginOtp, verifyLoginOtp } from "@/lib/queries/email-verification";
import { getOnboardingStatus } from "@/lib/queries/onboarding";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 30;

function VerifyLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") || "";

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, startVerify] = useTransition();
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

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const code = digits.join("");
    if (code.length !== CODE_LENGTH) { setError("Enter the full 6-digit code"); return; }
    setError(null); setNotice(null);
    startVerify(async () => {
      const result = await verifyLoginOtp(email, code);
      if (!result.ok) { setError(result.error || "Verification failed"); return; }
      try {
        const status = await getOnboardingStatus();
        window.location.href = status.completed ? "/dashboard" : "/onboarding";
      } catch {
        window.location.href = "/dashboard";
      }
    });
  }

  async function handleResend() {
    if (cooldown > 0 || !email) return;
    setError(null); setNotice(null); setResending(true);
    const result = await sendLoginOtp(email);
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fingerprint-verification.svg" alt="Verifying" className="h-12 w-12" />
        </div>
      </div>

      <h1 className="text-2xl font-black text-slate-900 mb-2 text-center">Verify your login</h1>
      <p className="text-sm mb-8 text-center text-slate-500">
        We sent a 6-digit code to{" "}
        <span className="font-semibold text-slate-700">{email || "your email"}</span>.
        Enter it below to sign in.
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
              className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold text-slate-800 rounded-xl outline-none transition-all"
              style={{ background: "#F3F4F8", border: "1.5px solid transparent" }}
              onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 3px rgba(24,167,184,.25)"; }}
              onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
            />
          ))}
        </div>

        <button type="submit" disabled={verifying || digits.join("").length !== CODE_LENGTH}
          className="w-full py-3.5 rounded-full font-bold text-sm text-white transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)", boxShadow: "0 4px 20px rgba(24,167,184,.3)" }}>
          {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {verifying ? "Verifying…" : "Confirm & Sign In"}
        </button>

        <div className="text-center text-sm text-slate-500">
          Didn&apos;t receive the code?{" "}
          <button type="button" onClick={handleResend} disabled={resending || cooldown > 0}
            className="font-bold hover:underline disabled:opacity-50 disabled:no-underline"
            style={{ color: "#18A7B8" }}>
            {resending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </div>

        <p className="text-center text-sm pt-2 text-slate-500">
          Wrong account?{" "}
          <Link href="/login" className="font-bold hover:underline" style={{ color: "#18A7B8" }}>
            Back to login
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function VerifyLoginPage() {
  return (
    <Suspense fallback={<div className="text-sm text-center py-8 text-slate-400">Loading…</div>}>
      <VerifyLoginForm />
    </Suspense>
  );
}
