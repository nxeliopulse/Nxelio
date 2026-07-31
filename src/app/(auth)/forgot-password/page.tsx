"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KeyRound, AlertCircle, Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const INPUT = {
  className: "w-full px-4 py-3 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none transition-all",
  style: {
    background: "#F3F4F8",
    border: "1.5px solid transparent",
  } as React.CSSProperties,
};

function ForgotPasswordForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) { setError("Enter a valid email address."); return; }
    setError(null);
    setSending(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
    });
    setSending(false);
    if (resetError) { setError(resetError.message); return; }
    setSent(true);
  }

  return (
    <div>
      <div className="flex justify-center mb-6">
        <div className="h-16 w-16 rounded-2xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,rgba(24,167,184,.18),rgba(126,87,194,.18))", border: "1.5px solid rgba(24,167,184,.3)" }}>
          <KeyRound className="h-7 w-7" style={{ color: "#4dd6e5" }} />
        </div>
      </div>

      <h1 className="text-2xl font-black text-slate-900 mb-2 text-center">Reset your password</h1>
      <p className="text-sm mb-8 text-center text-slate-500">
        {sent
          ? <>We&apos;ve sent a reset link to <span className="font-semibold text-slate-700">{email}</span>. Open it to choose a new password.</>
          : "Enter the email on your account and we'll send you a link to reset your password."}
      </p>

      {sent ? (
        <div className="space-y-5">
          <div className="flex items-start gap-2 rounded-xl p-3 text-sm"
            style={{ background: "rgba(24,167,184,.08)", border: "1.5px solid rgba(24,167,184,.25)", color: "#0d7d8c" }}>
            <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>Reset link sent — check your inbox (and spam folder).</span>
          </div>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="w-full py-3.5 rounded-full font-bold text-sm text-slate-700 transition-all hover:opacity-90"
            style={{ background: "#F3F4F8", border: "1.5px solid transparent" }}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-start gap-2 rounded-xl p-3 text-sm"
              style={{ background: "rgba(244,81,30,.08)", border: "1.5px solid rgba(244,81,30,.25)", color: "#c2410c" }}>
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <input
            type="email"
            placeholder="Email *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            {...INPUT}
            onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 3px rgba(24,167,184,.25)"; }}
            onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
          />

          <button type="submit" disabled={sending || !email.includes("@")}
            className="w-full py-3.5 rounded-full font-bold text-sm text-white transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)", boxShadow: "0 4px 20px rgba(24,167,184,.3)" }}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {sending ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      <p className="text-center text-sm pt-6 text-slate-500">
        Remembered your password?{" "}
        <Link href="/login" className="font-bold hover:underline" style={{ color: "#18A7B8" }}>
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="text-sm text-center py-8 text-slate-400">Loading…</div>}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
