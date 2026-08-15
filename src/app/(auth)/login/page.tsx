"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { sendVerificationCode } from "@/lib/queries/email-verification";
import { getOnboardingStatus } from "@/lib/queries/onboarding";

const INPUT = {
  className: "w-full px-3.5 py-2 rounded-xl text-sm text-slate-800 placeholder-slate-400 outline-none transition-all",
  style: {
    background: "#F3F4F8",
    border: "1.5px solid transparent",
  } as React.CSSProperties,
};
const LABEL = "block text-xs font-semibold text-slate-700 mb-1";

function LoginForm() {
  const router  = useRouter();
  const params  = useSearchParams();
  const [showPass, setShowPass]   = useState(false);
  const [form, setForm]           = useState({ email: "", password: "" });
  const [error, setError]         = useState<string | null>(null);
  const [notice, setNotice]       = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    const e = params.get("error");
    const verifiedEmail = params.get("email");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from URL params on mount
    if (e) setError(e === "invalid_link" ? "Your sign-in link is invalid or expired." : e);
    if (params.get("verified") === "1") {
      setNotice("Email verified — sign in below.");
      if (verifiedEmail) setForm((f) => ({ ...f, email: verifiedEmail }));
    }
    if (params.get("reset") === "1") {
      setNotice("Password updated — sign in with your new password.");
    }
    if (params.get("reason") === "idle") {
      setNotice("You were signed out after a period of inactivity.");
    }
  }, [params]);

  const valid = form.email.includes("@") && form.password.length >= 6;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null); setLoading(true);
    const supabase = createClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });

    if (loginError) {
      // Unconfirmed account — send a fresh code and hand off to the verify screen
      // instead of just showing an error the user can't act on.
      const unconfirmed = loginError.code === "email_not_confirmed" || /email not confirmed/i.test(loginError.message);
      if (unconfirmed) {
        await sendVerificationCode(form.email);
        setLoading(false);
        router.push(`/verify-email?email=${encodeURIComponent(form.email)}`);
        return;
      }
      setLoading(false);
      setError(loginError.message);
      return;
    }

    // The platform admin account lands in the standalone admin panel, not the customer app.
    if (form.email.trim().toLowerCase() === "admin@nxelio.com") {
      window.location.href = "/admin";
      return;
    }

    // Onboarding-aware routing — mirrors what the OAuth callback does for
    // returning users. Subscription status is deliberately not checked here;
    // that's (app)/layout.tsx's job. Wrapped in try/catch so a failure here
    // (e.g. a transient network/DB hiccup) shows an error instead of leaving
    // the button stuck on "Signing in…" forever with no feedback — the user
    // is already authenticated at this point, so falling back to /dashboard
    // on error is safe (its own layout will re-check onboarding/subscription).
    //
    // A hard navigation (not router.push + router.refresh) on purpose: the
    // session cookie was just set by signInWithPassword, and firing push()
    // immediately followed by refresh() raced the in-flight RSC fetch for
    // the destination route — the URL would silently change while the page
    // never actually rendered, only "fixing itself" on a manual reload. A
    // full page load has no such race and always sees the fresh session.
    try {
      const status = await getOnboardingStatus();
      window.location.href = status.completed ? "/dashboard" : "/onboarding";
    } catch (err) {
      setError(err instanceof Error ? `Signed in, but couldn't finish loading your account: ${err.message}` : "Signed in, but something went wrong loading your account.");
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-black text-slate-900 mb-0.5">Sign in</h1>
      <p className="text-xs mb-3.5 text-slate-500">
        Welcome back to your Nxelio Nurture workspace
      </p>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        {error && (
          <div className="flex items-start gap-2 rounded-xl p-3 text-sm"
            style={{ background:"rgba(244,81,30,.08)", border:"1.5px solid rgba(244,81,30,.25)", color:"#c2410c" }}>
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0"/>
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="flex items-start gap-2 rounded-xl p-3 text-sm"
            style={{ background:"rgba(24,167,184,.08)", border:"1.5px solid rgba(24,167,184,.25)", color:"#0d7d8c" }}>
            <Mail className="h-4 w-4 mt-0.5 flex-shrink-0"/>
            <span>{notice}</span>
          </div>
        )}

        {/* Email */}
        <div>
          <label className={LABEL}>Email Address</label>
          <div className="relative">
            <input
              type="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              {...INPUT}
              style={{ ...INPUT.style, paddingLeft: "2.6rem" }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#18A7B8";
                e.currentTarget.style.boxShadow = "0 0 0 4px rgba(24, 167, 184, 0.15)";
                e.currentTarget.style.background = "#FFFFFF";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#E2E8F0";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.background = "#F8FAFC";
              }}
            />
            <Mail className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-colors" />
          </div>
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-slate-700">Password</label>
            <Link
              href={`/forgot-password${form.email.includes("@") ? `?email=${encodeURIComponent(form.email)}` : ""}`}
              className="text-xs font-semibold hover:underline transition-colors"
              style={{ color:"#18A7B8" }}>
              Forgot Password?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              {...INPUT}
              style={{ ...INPUT.style, paddingLeft: "2.6rem", paddingRight: "2.75rem" }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#18A7B8";
                e.currentTarget.style.boxShadow = "0 0 0 4px rgba(24, 167, 184, 0.15)";
                e.currentTarget.style.background = "#FFFFFF";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#E2E8F0";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.background = "#F8FAFC";
              }}
            />
            <Eye className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-colors" />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors text-slate-400 hover:text-slate-600 p-1">
              {showPass ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button type="submit" disabled={!valid || loading}
          className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all transform active:scale-[0.99] hover:opacity-95 hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background:"linear-gradient(135deg, #18A7B8 0%, #7E57C2 100%)", boxShadow:"0 6px 24px rgba(24,167,184,.35)" }}>
          {loading ? "Signing in…" : "Sign In"}
        </button>

        {/* Switch */}
        <p className="text-center text-xs text-slate-500 pt-1">
          New on our platform?{" "}
          <Link href="/signup" className="font-bold hover:underline" style={{ color:"#18A7B8" }}>
            Create an Account
          </Link>
        </p>

        {/* OAuth */}
        <OAuthButtons />
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-sm text-center py-8 text-slate-400">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
