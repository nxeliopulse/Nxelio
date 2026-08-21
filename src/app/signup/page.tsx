"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle, User, Mail } from "lucide-react";
import { signUpDirect } from "@/lib/queries/auth";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { AuthSplitCard, FIELD_LABEL, UNDERLINE_INPUT, UNDERLINE_INPUT_STYLE, authInputFocus, authInputBlur, RadioToggle, AuthButtonRow } from "@/components/auth/auth-split-card";

export default function SignupPage() {
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [form, setForm]         = useState({ fullName: "", email: "", password: "" });
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [agreed, setAgreed]     = useState(false);
  // Shown exactly once, right after a brand-new account is created — never
  // on login or any later visit, since it's driven directly by the signup
  // success path rather than a persisted flag.
  const [showWelcome, setShowWelcome] = useState(false);
  const welcomeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (welcomeTimeoutRef.current) clearTimeout(welcomeTimeoutRef.current);
  }, []);

  const passOk = form.password.length >= 8;
  const valid  = form.fullName.trim() !== "" && form.email.includes("@") && passOk && agreed;

  function goToVerify() {
    router.push(`/verify-email?email=${encodeURIComponent(form.email)}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null); setLoading(true);
    const result = await signUpDirect({ email: form.email, password: form.password, fullName: form.fullName });
    setLoading(false);
    if (!result.ok) { setError(result.error || "Signup failed"); return; }
    setShowWelcome(true);
    welcomeTimeoutRef.current = setTimeout(goToVerify, 3200);
  }

  if (showWelcome) {
    return (
      <div className="force-light-theme min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="flex items-center gap-1.5 mb-6">
          <span className="h-2.5 w-2.5 rotate-45 bg-indigo-600 rounded-[2px] flex-shrink-0" />
          <span className="text-sm font-semibold text-indigo-600">Welcome</span>
        </div>
        <div className="bg-white rounded-2xl border-2 border-indigo-300 shadow-sm p-14 flex flex-col items-center max-w-xl w-full">
          <img src="/welcome-animation.svg" alt="Welcome" className="w-full max-w-sm h-auto" />
          <p className="text-base text-slate-500 mt-8 text-center">Your account is ready. Setting up your workspace…</p>
          <button
            type="button"
            onClick={goToVerify}
            className="mt-6 px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthSplitCard
      pageLabel="Sign Up"
      heading={["Welcome to Nxelio Nurture.", "Sign up to get started."]}
      subheading="7-day free trial — card required, no charge until day 7"
      illustration={
        <img
          src="/signup-illustration.svg"
          alt="Sign up illustration"
          className="w-full h-auto"
        />
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="flex items-start gap-2 rounded-lg p-3 text-sm"
            style={{ background: "rgba(244,81,30,.08)", border: "1.5px solid rgba(244,81,30,.25)", color: "#c2410c" }}>
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className={FIELD_LABEL}>Full name</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Jane Doe"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className={UNDERLINE_INPUT}
              style={UNDERLINE_INPUT_STYLE}
              onFocus={authInputFocus}
              onBlur={authInputBlur}
            />
            <User className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className={FIELD_LABEL}>Email</label>
          <div className="relative">
            <input
              type="email"
              placeholder="you@company.com"
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
          <p className="text-[11px] text-slate-400 mt-1">Minimum 8 characters</p>
        </div>

        <RadioToggle
          checked={agreed}
          onChange={setAgreed}
          label={
            <>
              I agree with{" "}
              <Link href="/terms" onClick={(e) => e.stopPropagation()} className="text-slate-700 font-medium hover:underline">terms</Link>
              {" "}&{" "}
              <Link href="/privacy" onClick={(e) => e.stopPropagation()} className="text-slate-700 font-medium hover:underline">conditions</Link>
            </>
          }
        />

        <div className="pt-2">
          <AuthButtonRow
            submitLabel={loading ? "Creating account…" : "Sign Up"}
            submitDisabled={!valid || loading}
            switchHref="/login"
            switchLabel="Sign In"
          />
        </div>

        <div className="pt-2">
          <OAuthButtons label="sign in with" />
        </div>
      </form>
    </AuthSplitCard>
  );
}
