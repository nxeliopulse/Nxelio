"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle, User, Mail } from "lucide-react";
import { signUpDirect } from "@/lib/queries/auth";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { AuthSplitCard, FIELD_LABEL, UNDERLINE_INPUT, UNDERLINE_INPUT_STYLE, authInputFocus, authInputBlur, RadioToggle, AuthButtonRow } from "@/components/auth/auth-split-card";
import { isValidEmail, EMAIL_ERROR } from "@/lib/validation";

// sessionStorage key holding the password between Signup -> Verify Email, so
// verify-email can sign the user straight into a real session (and on to
// onboarding) once the code checks out, instead of landing them back on the
// marketing page to log in manually. Browser-only and cleared immediately
// after use — deliberately NOT a URL param (that would leak into browser
// history / referrer headers / server logs).
const PENDING_PASSWORD_KEY = "nxelio_pending_signup_password";

export default function SignupPage() {
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [form, setForm]         = useState({ fullName: "", email: "", password: "" });
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [agreed, setAgreed]     = useState(false);
  // Mirrors login/page.tsx's pattern: the button stays clickable and
  // validation runs on submit, showing a specific reason under each field —
  // previously this form just left the button silently disabled with no way
  // to tell why (QA report S01/S03: invalid email or a short password gave
  // zero feedback, unlike Login).
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; email?: string; password?: string; agreed?: string }>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const email = form.email.trim();
    const fullName = form.fullName.trim();
    const errors: typeof fieldErrors = {};
    if (!fullName) errors.fullName = "Full name is required.";
    // \p{L} matches any Unicode letter, not just A-Z — accepts real names in
    // any script (José, 王芳, Владимир) while rejecting a purely numeric or
    // symbol string like "123456", which previously sailed through with no
    // check at all beyond "is the field non-empty".
    else if (!/\p{L}/u.test(fullName)) errors.fullName = "Full name must contain at least one letter.";
    if (!email) errors.email = "Email is required.";
    else if (!isValidEmail(email)) errors.email = EMAIL_ERROR;
    if (!form.password) errors.password = "Password is required.";
    else if (form.password.length < 8) errors.password = "Password must be at least 8 characters.";
    else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      // Length-only ("aaaaaaaa" passed) was the QA-flagged gap. Requiring a
      // letter AND a digit blocks the weakest cases without going as far as
      // demanding uppercase/symbols, which tends to push people toward
      // "Password1!"-style patterns that aren't meaningfully stronger.
      errors.password = "Password must contain at least one letter and one number.";
    }
    if (!agreed) errors.agreed = "You must agree to the terms to continue.";

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setForm((f) => ({ ...f, email }));
    setError(null); setLoading(true);
    const result = await signUpDirect({ email, password: form.password, fullName });
    setLoading(false);
    if (!result.ok) { setError(result.error || "Signup failed"); return; }
    try { sessionStorage.setItem(PENDING_PASSWORD_KEY, form.password); } catch {}
    router.push(`/verify-email?email=${encodeURIComponent(email)}`);
  }

  return (
    <AuthSplitCard
      heading="Get Started Now"
      subheading="Please enter your details to create your account."
      activeAuthTab="signup"
      leftEyebrow="You can easily"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-2.5">
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl p-3.5 text-sm bg-red-50 border border-red-100 text-red-600">
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
              onChange={(e) => { setForm({ ...form, fullName: e.target.value }); setFieldErrors((f) => ({ ...f, fullName: undefined })); }}
              className={UNDERLINE_INPUT}
              style={UNDERLINE_INPUT_STYLE}
              onFocus={authInputFocus}
              onBlur={authInputBlur}
              aria-invalid={!!fieldErrors.fullName}
            />
            <User className="h-4 w-4 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          {fieldErrors.fullName && <p className="mt-1 text-xs text-red-600">{fieldErrors.fullName}</p>}
        </div>

        <div>
          <label className={FIELD_LABEL}>Email</label>
          <div className="relative">
            <input
              type="email"
              placeholder="enter your email"
              value={form.email}
              onChange={(e) => { setForm({ ...form, email: e.target.value }); setFieldErrors((f) => ({ ...f, email: undefined })); }}
              className={UNDERLINE_INPUT}
              style={UNDERLINE_INPUT_STYLE}
              onFocus={authInputFocus}
              onBlur={authInputBlur}
              aria-invalid={!!fieldErrors.email}
            />
            <Mail className="h-4 w-4 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
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
              onChange={(e) => { setForm({ ...form, password: e.target.value }); setFieldErrors((f) => ({ ...f, password: undefined })); }}
              className={UNDERLINE_INPUT}
              style={UNDERLINE_INPUT_STYLE}
              onFocus={authInputFocus}
              onBlur={authInputBlur}
              aria-invalid={!!fieldErrors.password}
            />
            <button type="button" onClick={() => setShowPass(!showPass)}
              aria-label={showPass ? "Hide password" : "Show password"}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.password
            ? <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
            : <p className="text-[10px] text-slate-500 mt-1 font-medium">Minimum 8 characters, with a letter and a number</p>}
        </div>

        <div>
          <RadioToggle
            checked={agreed}
            onChange={(v) => { setAgreed(v); setFieldErrors((f) => ({ ...f, agreed: undefined })); }}
            label={
              <>
                {/* Two separate documents get two honestly-labeled links —
                    "terms" / "conditions" read as one phrase pointing at a
                    single document, so a QA pass flagged clicking "conditions"
                    and landing on the unrelated Privacy Policy as a mislink. */}
                I agree with the{" "}
                <Link href="/terms" onClick={(e) => e.stopPropagation()} className="text-slate-900 font-medium hover:underline">Terms of Service</Link>
                {" "}and{" "}
                <Link href="/privacy" onClick={(e) => e.stopPropagation()} className="text-slate-900 font-medium hover:underline">Privacy Policy</Link>
              </>
            }
          />
          {fieldErrors.agreed && <p className="mt-1 text-xs text-red-600">{fieldErrors.agreed}</p>}
        </div>

        <div className="pt-2">
          <AuthButtonRow
            submitLabel={loading ? "Creating account…" : "Sign Up"}
            submitDisabled={loading}
            switchHref="/login"
            switchLabel="Sign In"
          >
            <OAuthButtons label="OR" />
          </AuthButtonRow>
        </div>
      </form>
    </AuthSplitCard>
  );
}
