"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const INPUT = {
  className: "w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/30 outline-none transition-all",
  style: {
    background: "rgba(255,255,255,.06)",
    border: "1.5px solid rgba(255,255,255,.1)",
  } as React.CSSProperties,
};

function LoginForm() {
  const router  = useRouter();
  const params  = useSearchParams();
  const [showPass, setShowPass]   = useState(false);
  const [form, setForm]           = useState({ email: "", password: "" });
  const [error, setError]         = useState<string | null>(null);
  const [notice, setNotice]       = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const e = params.get("error");
    if (e) setError(e === "invalid_link" ? "Your sign-in link is invalid or expired." : e);
  }, [params]);

  async function handleForgotPassword() {
    setError(null); setNotice(null);
    if (!form.email.includes("@")) { setError('Enter your email first, then click "Forgot password?"'); return; }
    setResetting(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(form.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
    });
    setResetting(false);
    if (resetError) { setError(resetError.message); return; }
    setNotice(`Reset link sent to ${form.email}. Check your inbox.`);
  }

  const valid = form.email.includes("@") && form.password.length >= 6;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null); setLoading(true);
    const supabase = createClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
    setLoading(false);
    if (loginError) { setError(loginError.message); return; }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-3xl font-black text-white mb-1">Sign in</h1>
      <p className="text-sm mb-8" style={{ color:"rgba(255,255,255,.45)" }}>
        Welcome back to your Nxelio workspace
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl p-3 text-sm"
            style={{ background:"rgba(244,81,30,.12)", border:"1.5px solid rgba(244,81,30,.3)", color:"#ff8a65" }}>
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0"/>
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="flex items-start gap-2 rounded-xl p-3 text-sm"
            style={{ background:"rgba(24,167,184,.12)", border:"1.5px solid rgba(24,167,184,.3)", color:"#4dd6e5" }}>
            <Mail className="h-4 w-4 mt-0.5 flex-shrink-0"/>
            <span>{notice}</span>
          </div>
        )}

        {/* Email */}
        <input
          type="email"
          placeholder="Email *"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          {...INPUT}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#18A7B8"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(24,167,184,.15)"; }}
          onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,.1)"; e.currentTarget.style.boxShadow = "none"; }}
        />

        {/* Password */}
        <div className="relative">
          <input
            type={showPass ? "text" : "password"}
            placeholder="Password *"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            {...INPUT}
            style={{ ...INPUT.style, paddingRight: "2.75rem" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#18A7B8"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(24,167,184,.15)"; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,.1)"; e.currentTarget.style.boxShadow = "none"; }}
          />
          <button type="button" onClick={() => setShowPass(!showPass)}
            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
            style={{ color:"rgba(255,255,255,.35)" }}>
            {showPass ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
          </button>
        </div>

        {/* Forgot */}
        <div className="flex justify-end">
          <button type="button" onClick={handleForgotPassword} disabled={resetting}
            className="text-xs font-semibold hover:underline disabled:opacity-50 transition-colors"
            style={{ color:"#18A7B8" }}>
            {resetting ? "Sending…" : "Forgot password?"}
          </button>
        </div>

        {/* Submit */}
        <button type="submit" disabled={!valid || loading}
          className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background:"linear-gradient(135deg,#18A7B8,#7E57C2)", boxShadow:"0 4px 20px rgba(24,167,184,.3)" }}>
          {loading ? "Signing in…" : "Sign In"}
        </button>

        {/* No credit card */}
        <p className="text-center text-xs font-medium" style={{ color:"rgba(255,255,255,.35)" }}>
          ✓ No credit card required
        </p>

        {/* Switch */}
        <p className="text-center text-sm pt-2" style={{ color:"rgba(255,255,255,.4)" }}>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-bold hover:underline" style={{ color:"#18A7B8" }}>
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-sm text-center py-8" style={{ color:"rgba(255,255,255,.4)" }}>Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
