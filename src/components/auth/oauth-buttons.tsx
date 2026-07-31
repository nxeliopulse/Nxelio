"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Provider = "google" | "linkedin_oidc";

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

/** The real LinkedIn "in" glyph (standard brand mark), no background — the circular button itself supplies the #0A66C2 fill. */
function LinkedInGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 448 512" fill="white" xmlns="http://www.w3.org/2000/svg">
      <path d="M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3z"/>
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
        scopes: provider === "linkedin_oidc" ? "openid profile email" : undefined,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoadingProvider(null);
    }
    // On success the browser is redirected — no need to clear loading state
  }

  const circleBase = "h-9 w-9 rounded-full flex items-center justify-center transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";

  return (
    <div className="space-y-2.5">
      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* Circular provider buttons */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          aria-label="Continue with Google"
          disabled={!!loadingProvider}
          onClick={() => signInWith("google")}
          className={circleBase}
          style={{ background: "white", border: "1.5px solid #E2E8F0" }}
        >
          {loadingProvider === "google"
            ? <span className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
            : <GoogleIcon />}
        </button>

        <button
          type="button"
          aria-label="Continue with LinkedIn"
          disabled={!!loadingProvider}
          onClick={() => signInWith("linkedin_oidc")}
          className={circleBase}
          style={{ background: "#0A66C2" }}
        >
          {loadingProvider === "linkedin_oidc"
            ? <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            : <LinkedInGlyph />}
        </button>
      </div>

      {error && (
        <p className="text-center text-xs rounded-xl px-3 py-2"
          style={{ background: "rgba(244,81,30,.1)", border: "1px solid rgba(244,81,30,.3)", color: "#ff8a65" }}>
          {error}
        </p>
      )}
    </div>
  );
}
