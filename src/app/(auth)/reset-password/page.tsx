"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Loader2, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const INPUT = {
  className: "w-full px-4 py-3 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none transition-all",
  style: {
    background: "#F3F4F8",
    border: "1.5px solid transparent",
  } as React.CSSProperties,
};

/**
 * The reset link points HERE with ?token_hash=...&type=recovery (not straight
 * to Supabase's own auto-consuming verify endpoint) — the token is only
 * exchanged for a session inside handleSubmit, i.e. on a real click. This is
 * what actually fixes the "otp_expired" issue: an email-security scanner that
 * pre-fetches the link with a plain GET never triggers verifyOtp, so it can
 * no longer burn the one-time token before the real user clicks anything.
 * Requires the Supabase "Reset Password" email template to link here with
 * those params instead of {{ .ConfirmationURL }} — see chat for the exact
 * template snippet.
 */
function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const tokenHash = params.get("token_hash");

  const [showPass, setShowPass] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const valid = password.length >= 6 && password === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenHash) { setError("This link is invalid or has expired. Request a new one below."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }

    setError(null);
    setSubmitting(true);
    const supabase = createClient();

    const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
    if (verifyError) {
      setSubmitting(false);
      setError("This link has expired or was already used. Request a new one below.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setSubmitting(false);
      setError(updateError.message);
      return;
    }

    // Don't leave the temporary recovery session active — send them back to a
    // normal sign-in with the new password instead.
    await supabase.auth.signOut();
    setSubmitting(false);
    router.push("/login?reset=1");
  }

  return (
    <div>
      <div className="mb-6">
        <div className="h-12 w-12 rounded-2xl bg-blue-500/15 border border-blue-400/25 flex items-center justify-center mb-4 text-blue-300">
          <KeyRound className="h-6 w-6" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
          Choose a new password
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
          Enter a new password for your account below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl p-3 text-xs sm:text-sm bg-red-50 border border-red-200 text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5">New password</label>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              placeholder="Enter new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-white/15 focus:border-blue-400 focus:ring-4 focus:ring-blue-400/15 text-sm text-white placeholder:text-slate-500 bg-white/[0.06] backdrop-blur-sm transition-all outline-none pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5">Confirm new password</label>
          <input
            type={showPass ? "text" : "password"}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-white/15 focus:border-blue-400 focus:ring-4 focus:ring-blue-400/15 text-sm text-white placeholder:text-slate-500 bg-white/[0.06] backdrop-blur-sm transition-all outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={!valid || submitting}
          className="w-full py-3.5 px-6 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.99] transition-all shadow-md shadow-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? "Updating…" : "Reset password"}
        </button>
      </form>

      <p className="text-center text-xs text-slate-400 font-medium pt-5">
        Link expired or not working?{" "}
        <Link href="/forgot-password" className="font-bold text-blue-400 hover:text-blue-300 hover:underline">
          Request a new one
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="text-sm text-center py-8 text-slate-400">Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
