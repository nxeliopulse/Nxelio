"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Provider = "google";

interface OAuthButtonsProps {
  /** Label shown above the divider — defaults to "Or continue with" */
  label?: string;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
  );
}

export function OAuthButtons({ label = "or" }: OAuthButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signInWith(provider: Provider) {
    setError(null);
    setLoadingProvider(provider);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoadingProvider(null);
    }
    // On success the browser is redirected — no need to clear loading state
  }

  return (
    <div className="space-y-3">
      {/* Divider */}
      <div className="flex items-center gap-3 my-2">
        <div className="flex-1 h-px bg-white/15" />
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        <div className="flex-1 h-px bg-white/15" />
      </div>

      <button
        type="button"
        disabled={!!loadingProvider}
        onClick={() => signInWith("google")}
        className="w-full flex items-center justify-center gap-2.5 h-11 rounded-xl text-sm font-semibold text-slate-700 transition-all bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-xs disabled:opacity-50 cursor-pointer"
      >
        {loadingProvider === "google"
          ? <span className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
          : <GoogleIcon />}
        <span>Login with Google</span>
      </button>

      {error && (
        <p className="text-center text-xs rounded-xl px-3 py-2 bg-red-50 text-red-600 border border-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
