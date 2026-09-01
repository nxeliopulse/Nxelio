"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KeyRound, AlertCircle, Check, Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
      <div className="mb-6">
        <div className="h-12 w-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-4 text-blue-600">
          <KeyRound className="h-6 w-6" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Reset password
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
          {sent
            ? <>We&apos;ve sent a reset link to <span className="font-semibold text-slate-900">{email}</span>.</>
            : "Enter the email associated with your account to receive a reset link."}
        </p>
      </div>

      {sent ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl p-3.5 text-xs sm:text-sm bg-emerald-50 border border-emerald-200 text-emerald-800">
            <Check className="h-4 w-4 mt-0.5 text-emerald-600 flex-shrink-0" />
            <span>Reset link sent — check your inbox (and spam folder).</span>
          </div>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-sm text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-all cursor-pointer"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-xl p-3 text-xs sm:text-sm bg-red-50 border border-red-200 text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Email</label>
            <div className="relative">
              <input
                type="email"
                placeholder="enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 text-sm text-slate-900 placeholder:text-slate-400 bg-white backdrop-blur-md transition-all outline-none pr-10"
              />
              <Mail className="h-4 w-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <button
            type="submit"
            disabled={sending || !email.includes("@")}
            className="w-full py-3.5 px-6 rounded-full text-sm font-bold text-white bg-blue-500 hover:bg-blue-400 active:scale-[0.99] transition-all shadow-lg shadow-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {sending ? "Sending reset link…" : "Send reset link"}
          </button>
        </form>
      )}

      <p className="text-center text-xs text-slate-500 font-medium pt-5">
        Remembered your password?{" "}
        <Link href="/login" className="font-bold text-blue-600 hover:text-blue-500 hover:underline">
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
