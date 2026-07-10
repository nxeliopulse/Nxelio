"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Provider = "google" | "linkedin_oidc";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14ZM7.12 20.45H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

/**
 * "Continue with Google / LinkedIn" buttons. Both kick off a Supabase OAuth
 * redirect and come back through /auth/callback, which exchanges the code for a
 * session. New OAuth users get a workspace + profile via the on_auth_user_created
 * DB trigger (it reads full_name from the provider's metadata).
 *
 * Requires the Google and LinkedIn (OIDC) providers to be enabled in the Supabase
 * dashboard with their client id/secret and this app's /auth/callback redirect URL.
 */
export function SocialAuthButtons({
  next = "/dashboard",
  disabled,
  onError,
  variant = "light",
}: {
  next?: string;
  disabled?: boolean;
  onError?: (message: string) => void;
  /** "dark" matches the glassy dark login/signup card; "light" is the original white-card look. */
  variant?: "light" | "dark";
}) {
  const [busy, setBusy] = useState<Provider | null>(null);

  async function signIn(provider: Provider) {
    onError?.("");
    setBusy(provider);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    // On success the browser is redirected to the provider, so we only land here on error.
    if (error) {
      setBusy(null);
      onError?.(error.message);
    }
  }

  const base = "flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
  const light = "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  const dark = "border-[1.5px] border-white/10 bg-white/[.06] text-white hover:bg-white/[.1]";

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => signIn("google")} disabled={disabled || busy !== null} className={`${base} ${variant === "dark" ? dark : light}`}>
        <GoogleIcon />
        {busy === "google" ? "Redirecting…" : "Continue with Google"}
      </button>
      <button type="button" onClick={() => signIn("linkedin_oidc")} disabled={disabled || busy !== null} className={`${base} ${variant === "dark" ? dark : light}`}>
        <LinkedInIcon />
        {busy === "linkedin_oidc" ? "Redirecting…" : "Continue with LinkedIn"}
      </button>

      <div className="flex items-center gap-3 py-1">
        <div className={`h-px flex-1 ${variant === "dark" ? "bg-white/10" : "bg-slate-200"}`} />
        <span className={`text-xs font-medium ${variant === "dark" ? "text-white/35" : "text-slate-400"}`}>or</span>
        <div className={`h-px flex-1 ${variant === "dark" ? "bg-white/10" : "bg-slate-200"}`} />
      </div>
    </div>
  );
}
