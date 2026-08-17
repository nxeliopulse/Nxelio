"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Check, User, Mail, Lock } from "lucide-react";
import { signUpDirect } from "@/lib/queries/auth";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

const INPUT = {
  className: "w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-800 placeholder-slate-400 outline-none transition-all duration-200",
  style: {
    background: "#F8FAFC",
    border: "1.5px solid #E2E8F0",
  } as React.CSSProperties,
};
const LABEL = "block text-xs font-semibold text-slate-700 mb-1";

export default function SignupPage() {
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [form, setForm]         = useState({ fullName:"", email:"", password:"" });
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [agreed, setAgreed]     = useState(false);

  const passOk = form.password.length >= 8;
  const valid  = form.fullName.trim() !== "" && form.email.includes("@") && passOk && agreed;

  const focusStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#18A7B8";
    e.currentTarget.style.boxShadow = "0 0 0 4px rgba(24, 167, 184, 0.15)";
    e.currentTarget.style.background = "#FFFFFF";
  };
  const blurStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#E2E8F0";
    e.currentTarget.style.boxShadow = "none";
    e.currentTarget.style.background = "#F8FAFC";
  };

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
    <div>
      <h1 className="text-2xl font-black text-slate-900 mb-1">Sign up</h1>
      <p className="text-sm mb-6 text-slate-500">
        7-day free trial — card required, no charge until day 7
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg p-3 text-sm"
            style={{ background:"rgba(244,81,30,.08)", border:"1.5px solid rgba(244,81,30,.25)", color:"#c2410c" }}>
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0"/>
            <span>{error}</span>
          </div>
        )}

        {/* Full name */}
        <div>
          <label className={LABEL}>Full Name</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Jane Doe"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              {...INPUT}
              style={{ ...INPUT.style, paddingLeft: "2.6rem" }}
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
            <User className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-colors" />
          </div>
        </div>

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
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
            <Mail className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-colors" />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className={LABEL}>Password</label>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              {...INPUT}
              style={{ ...INPUT.style, paddingLeft: "2.6rem", paddingRight: "2.75rem" }}
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
            <Lock className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-colors" />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors text-slate-400 hover:text-slate-600 p-1">
              {showPass ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
            </button>
          </div>
        </div>

        {/* Password rule + legal agreement */}
        <div className="space-y-2 py-0.5">
          <div className="flex items-center gap-2 px-1">
            <div className="h-4 w-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
              style={{ background: passOk ? "#18A7B8" : "#E2E8F0" }}>
              <Check className="h-2.5 w-2.5 text-white"/>
            </div>
            <span className="text-xs transition-colors font-medium"
              style={{ color: passOk ? "#0d7d8c" : "#94A3B8" }}>
              At least 8 characters
            </span>
          </div>

          <label className="flex items-start gap-2.5 px-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="sr-only peer"
            />
            <span
              className="mt-0.5 h-4 w-4 rounded flex items-center justify-center flex-shrink-0 transition-all border shadow-sm"
              style={{
                background: agreed ? "#18A7B8" : "transparent",
                borderColor: agreed ? "#18A7B8" : "#CBD5E1",
              }}
            >
              {agreed && <Check className="h-2.5 w-2.5 text-white" />}
            </span>
            <span className="text-xs leading-snug text-slate-500">
              I agree to the{" "}
              <Link href="/terms" onClick={(e) => e.stopPropagation()} className="hover:underline text-slate-700 font-medium">Terms of Service</Link>
              {" "}and{" "}
              <Link href="/privacy" onClick={(e) => e.stopPropagation()} className="hover:underline text-slate-700 font-medium">Privacy Policy</Link>.
            </span>
          </label>
        </div>

        {/* Submit */}
        <button type="submit" disabled={!valid || loading}
          className="w-full py-2.5 rounded-lg font-bold text-sm text-white transition-all transform active:scale-[0.99] hover:opacity-95 hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background:"linear-gradient(135deg, #18A7B8 0%, #7E57C2 100%)", boxShadow:"0 6px 24px rgba(24,167,184,.35)" }}>
          {loading ? "Creating account…" : "Sign Up"}
        </button>

        {/* Switch */}
        <p className="text-center text-xs text-slate-500 pt-1">
          Have an account?{" "}
          <Link href="/login" className="font-bold hover:underline" style={{ color:"#18A7B8" }}>
            Sign in
          </Link>
        </p>

        {/* OAuth */}
        <OAuthButtons />
      </form>
    </div>
  );
}
