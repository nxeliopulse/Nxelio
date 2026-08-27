"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Mail } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { getOnboardingStatus } from "@/lib/queries/onboarding";
import { AuthSplitCard, FIELD_LABEL, UNDERLINE_INPUT, UNDERLINE_INPUT_STYLE, authInputFocus, authInputBlur, RadioToggle, AuthButtonRow } from "@/components/auth/auth-split-card";
import { friendlyAuthError } from "@/lib/auth/auth-error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

function LoginForm() {
  const params  = useSearchParams();
  const [showPass, setShowPass]   = useState(false);
  const [form, setForm]           = useState({ email: "", password: "" });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [notice, setNotice]       = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [signUpLoading, setSignUpLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);

  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntil(null);
        setLockSecondsLeft(0);
        setFailedAttempts(0);
      } else {
        setLockSecondsLeft(remaining);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lockedUntil) return;

    const email = form.email.trim();
    const errors: { email?: string; password?: string } = {};
    if (!email) errors.email = "Email is required.";
    else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
    if (!form.password) errors.password = "Password is required.";
    else if (form.password.length < 6) errors.password = "Password must be at least 6 characters.";

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setForm((f) => ({ ...f, email }));
    setError(null); setLoading(true);
    const supabase = createClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password: form.password });

    if (loginError) {
      setLoading(false);
      setError(friendlyAuthError(loginError));
      const attempts = failedAttempts + 1;
      setFailedAttempts(attempts);
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_MS);
        setError("Too many failed attempts. Please wait before trying again.");
      }
      return;
    }
    setFailedAttempts(0);

    // The platform admin account lands in the standalone admin panel.
    if (form.email.trim().toLowerCase() === "admin@nxelio.com") {
      window.location.href = "/admin";
      return;
    }

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
      heading="Welcome Back"
      subheading="Please log in to your account to continue."
      activeAuthTab="login"
      leftEyebrow="You can easily"
      leftTitle="Speed up your work with our Web App"
    >
      <form onSubmit={handleSubmit} className="space-y-2.5">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg p-2.5 text-xs sm:text-sm"
            style={{ background: "rgba(244,81,30,.08)", border: "1.5px solid rgba(244,81,30,.25)", color: "#c2410c" }}>
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}{lockedUntil ? ` (${lockSecondsLeft}s)` : ""}</span>
          </div>
        )}
        {notice && (
          <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs sm:text-sm"
            style={{ background: "rgba(79,95,239,.08)", border: "1.5px solid rgba(79,95,239,.25)", color: "#3D4FEA" }}>
            <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <OAuthButtons label="or" />

        <div>
          <label className={FIELD_LABEL}>Email</label>
          <div className="relative">
            <input
              type="email"
              placeholder="enter your email"
              value={form.email}
              maxLength={254}
              onChange={(e) => { setForm({ ...form, email: e.target.value }); setFieldErrors((f) => ({ ...f, email: undefined })); }}
              onBlur={(ev) => { authInputBlur(ev); setForm((f) => ({ ...f, email: f.email.trim() })); }}
              className={UNDERLINE_INPUT}
              style={UNDERLINE_INPUT_STYLE}
              onFocus={authInputFocus}
              aria-invalid={!!fieldErrors.email}
            />
            <Mail className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
          </div>
          {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
        </div>

        <div>
          <label className={FIELD_LABEL}>Password</label>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              placeholder="Start typing..."
              value={form.password}
              maxLength={128}
              onChange={(e) => { setForm({ ...form, password: e.target.value }); setFieldErrors((f) => ({ ...f, password: undefined })); }}
              className={UNDERLINE_INPUT}
              style={UNDERLINE_INPUT_STYLE}
              onFocus={authInputFocus}
              onBlur={authInputBlur}
              aria-invalid={!!fieldErrors.password}
            />
            <button type="button" onClick={() => setShowPass(!showPass)}
              aria-label={showPass ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.password && <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>}
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <RadioToggle checked={rememberMe} onChange={setRememberMe} label="Remember me" />
          <Link
            href={`/forgot-password${form.email.includes("@") ? `?email=${encodeURIComponent(form.email)}` : ""}`}
            className="text-xs font-semibold text-blue-400 hover:text-blue-300 hover:underline"
          >
            Recover password
          </Link>
        </div>

        <div className="pt-1">
          <AuthButtonRow
            submitLabel={loading ? "Signing in…" : lockedUntil ? `Try again in ${lockSecondsLeft}s` : "Sign In"}
            submitDisabled={loading || !!lockedUntil}
            switchHref="/signup"
            switchLabel="Sign Up"
            switchLoading={signUpLoading}
            onSwitchClick={() => setSignUpLoading(true)}
          />
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
