"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle, User, Mail } from "lucide-react";
import { signUpDirect } from "@/lib/queries/auth";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { AuthSplitCard, FIELD_LABEL, UNDERLINE_INPUT, UNDERLINE_INPUT_STYLE, authInputFocus, authInputBlur, RadioToggle, AuthButtonRow } from "@/components/auth/auth-split-card";
import { SignupIllustration } from "@/components/auth/auth-illustrations";

export default function SignupPage() {
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [form, setForm]         = useState({ fullName: "", email: "", password: "" });
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [agreed, setAgreed]     = useState(false);

  const passOk = form.password.length >= 8;
  const valid  = form.fullName.trim() !== "" && form.email.includes("@") && passOk && agreed;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null); setLoading(true);
    const result = await signUpDirect({ email: form.email, password: form.password, fullName: form.fullName });
    setLoading(false);
    if (!result.ok) { setError(result.error || "Signup failed"); return; }
    router.push(`/verify-email?email=${encodeURIComponent(form.email)}`);
  }

  return (
    <AuthSplitCard
      pageLabel="Sign Up"
      heading={["Welcome to Nxelio Nurture.", "Sign up to get started."]}
      subheading="7-day free trial — card required, no charge until day 7"
      illustration={<SignupIllustration />}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
