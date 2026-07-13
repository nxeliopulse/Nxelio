"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { signUpDirect } from "@/lib/queries/auth";

const INPUT = {
  className: "w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/30 outline-none transition-all",
  style: {
    background: "rgba(255,255,255,.06)",
    border: "1.5px solid rgba(255,255,255,.1)",
  } as React.CSSProperties,
};

export default function SignupPage() {
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [form, setForm]         = useState({ fullName:"", email:"", password:"" });
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  const passOk = form.password.length >= 8;
  const valid  = form.fullName.trim() !== "" && form.email.includes("@") && passOk;

  const focusStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#18A7B8";
    e.currentTarget.style.boxShadow   = "0 0 0 3px rgba(24,167,184,.15)";
  };
  const blurStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "rgba(255,255,255,.1)";
    e.currentTarget.style.boxShadow   = "none";
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null); setLoading(true);
    const result = await signUpDirect({ email: form.email, password: form.password, fullName: form.fullName });
    if (!result.ok) { setLoading(false); setError(result.error || "Signup failed"); return; }
    const supabase = createClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
    setLoading(false);
    if (loginError) { setError("Account created — please log in."); router.push("/login"); return; }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-3xl font-black text-white mb-1">Sign up</h1>
      <p className="text-sm mb-8" style={{ color:"rgba(255,255,255,.45)" }}>
        Start your 7-day free trial — no card needed
      </p>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {error && (
          <div className="flex items-start gap-2 rounded-xl p-3 text-sm"
            style={{ background:"rgba(244,81,30,.12)", border:"1.5px solid rgba(244,81,30,.3)", color:"#ff8a65" }}>
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0"/>
            <span>{error}</span>
          </div>
        )}

        {/* Full name */}
        <input
          type="text"
          placeholder="Full name *"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          {...INPUT}
          onFocus={focusStyle}
          onBlur={blurStyle}
        />

        {/* Email */}
        <input
          type="email"
          placeholder="Email *"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          {...INPUT}
          onFocus={focusStyle}
          onBlur={blurStyle}
        />

        {/* Password */}
        <div className="relative">
          <input
            type={showPass ? "text" : "password"}
            placeholder="Password *"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            {...INPUT}
            style={{ ...INPUT.style, paddingRight:"2.75rem" }}
            onFocus={focusStyle}
            onBlur={blurStyle}
          />
          <button type="button" onClick={() => setShowPass(!showPass)}
            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
            style={{ color:"rgba(255,255,255,.35)" }}>
            {showPass ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
          </button>
        </div>

        {/* Password rule */}
        <div className="flex items-center gap-2 px-1">
          <div className="h-4 w-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
            style={{ background: passOk ? "#18A7B8" : "rgba(255,255,255,.1)" }}>
            <Check className="h-2.5 w-2.5 text-white"/>
          </div>
          <span className="text-xs transition-colors"
            style={{ color: passOk ? "#4dd6e5" : "rgba(255,255,255,.3)" }}>
            At least 8 characters
          </span>
        </div>

        {/* Submit */}
        <button type="submit" disabled={!valid || loading}
          className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background:"linear-gradient(135deg,#18A7B8,#7E57C2)", boxShadow:"0 4px 20px rgba(24,167,184,.3)" }}>
          {loading ? "Creating account…" : "Sign Up"}
        </button>

        {/* Legal agreement */}
        <p className="text-center text-xs leading-relaxed" style={{ color:"rgba(255,255,255,.35)" }}>
          By signing up, you agree to our{" "}
          <Link href="/terms" className="hover:underline" style={{ color:"rgba(255,255,255,.55)" }}>Terms of Service</Link>
          {" "}and{" "}
          <Link href="/privacy" className="hover:underline" style={{ color:"rgba(255,255,255,.55)" }}>Privacy Policy</Link>.
        </p>

        {/* No credit card */}
        <p className="text-center text-xs font-medium" style={{ color:"rgba(255,255,255,.35)" }}>
          ✓ No credit card required
        </p>

        {/* Switch */}
        <p className="text-center text-sm pt-1" style={{ color:"rgba(255,255,255,.4)" }}>
          Have an account?{" "}
          <Link href="/login" className="font-bold hover:underline" style={{ color:"#18A7B8" }}>
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
