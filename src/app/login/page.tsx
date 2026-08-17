"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Mail } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { sendVerificationCode } from "@/lib/queries/email-verification";
import { getOnboardingStatus } from "@/lib/queries/onboarding";
import { AuthSplitCard, FIELD_LABEL, UNDERLINE_INPUT, UNDERLINE_INPUT_STYLE, authInputFocus, authInputBlur, RadioToggle, AuthButtonRow } from "@/components/auth/auth-split-card";

function LoginForm() {
  const router  = useRouter();
  const params  = useSearchParams();
  const [showPass, setShowPass]   = useState(false);
  const [form, setForm]           = useState({ email: "", password: "" });
  const [rememberMe, setRememberMe] = useState(true);
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
    <AuthSplitCard
      pageLabel="Sign In"
      heading={["Welcome back to Nxelio Nurture.", "Sign in to see the latest updates."]}
      subheading="Enter your details to proceed further"
      illustration={
        <img
          src="/login-illustration.svg"
          alt="Sign in illustration"
          className="w-full h-auto"
        />
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg p-3 text-sm"
            style={{ background: "rgba(244,81,30,.08)", border: "1.5px solid rgba(244,81,30,.25)", color: "#c2410c" }}>
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="flex items-start gap-2 rounded-lg p-3 text-sm"
            style={{ background: "rgba(79,95,239,.08)", border: "1.5px solid rgba(79,95,239,.25)", color: "#3D4FEA" }}>
            <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <div>
          <label className={FIELD_LABEL}>Email</label>
          <div className="relative">
            <input
              type="email"
              placeholder="john.doe@gmail.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={UNDERLINE_INPUT}
              style={UNDERLINE_INPUT_STYLE}
              onFocus={authInputFocus}
              onBlur={authInputBlur}
            />
            <Mail className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className={FIELD_LABEL}>Password</label>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              placeholder="Start typing..."
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={UNDERLINE_INPUT}
              style={UNDERLINE_INPUT_STYLE}
              onFocus={authInputFocus}
              onBlur={authInputBlur}
            />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <RadioToggle checked={rememberMe} onChange={setRememberMe} label="Remember me" />
          <Link
            href={`/forgot-password${form.email.includes("@") ? `?email=${encodeURIComponent(form.email)}` : ""}`}
            className="text-xs font-semibold text-indigo-600 hover:underline"
          >
            Recover password
          </Link>
        </div>

        <div className="pt-2">
          <AuthButtonRow
            submitLabel={loading ? "Signing in…" : "Sign In"}
            submitDisabled={!valid || loading}
            switchHref="/signup"
            switchLabel="Sign Up"
          />
        </div>

        <div className="pt-2">
          <OAuthButtons label="sign in with" />
        </div>
      </form>
    </AuthSplitCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-slate-400">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
