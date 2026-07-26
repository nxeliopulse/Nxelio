"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Loader2, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const INPUT = {
  className: "w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/30 outline-none transition-all",
  style: {
    background: "rgba(255,255,255,.06)",
    border: "1.5px solid rgba(255,255,255,.1)",
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
      <div className="flex justify-center mb-6">
        <div className="h-16 w-16 rounded-2xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,rgba(24,167,184,.18),rgba(126,87,194,.18))", border: "1.5px solid rgba(24,167,184,.3)" }}>
          <KeyRound className="h-7 w-7" style={{ color: "#4dd6e5" }} />
        </div>
      </div>

      <h1 className="text-2xl font-black text-white mb-2 text-center">Choose a new password</h1>
      <p className="text-sm mb-8 text-center" style={{ color: "rgba(255,255,255,.45)" }}>
        Enter a new password for your account below.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl p-3 text-sm"
            style={{ background: "rgba(244,81,30,.12)", border: "1.5px solid rgba(244,81,30,.3)", color: "#ff8a65" }}>
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="relative">
          <input
            type={showPass ? "text" : "password"}
            placeholder="New password *"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            {...INPUT}
            style={{ ...INPUT.style, paddingRight: "2.75rem" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#18A7B8"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(24,167,184,.15)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,.1)"; e.currentTarget.style.boxShadow = "none"; }}
          />
          <button type="button" onClick={() => setShowPass(!showPass)}
            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
            style={{ color: "rgba(255,255,255,.35)" }}>
            {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <input
          type={showPass ? "text" : "password"}
          placeholder="Confirm new password *"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          {...INPUT}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#18A7B8"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(24,167,184,.15)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,.1)"; e.currentTarget.style.boxShadow = "none"; }}
        />

        <button type="submit" disabled={!valid || submitting}
          className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg,#18A7B8,#7E57C2)", boxShadow: "0 4px 20px rgba(24,167,184,.3)" }}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? "Updating…" : "Reset password"}
        </button>
      </form>

      <p className="text-center text-sm pt-6" style={{ color: "rgba(255,255,255,.4)" }}>
        Link expired or not working?{" "}
        <Link href="/forgot-password" className="font-bold hover:underline" style={{ color: "#18A7B8" }}>
          Request a new one
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="text-sm text-center py-8" style={{ color: "rgba(255,255,255,.4)" }}>Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
