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

function LinkedInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="4" fill="#0A66C2"/>
      <path d="M7.5 10h-2v7h2v-7zm-1-3.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zM17 10c-1.38 0-2.4.62-2.88 1.19V10H12v7h2.12v-3.67c0-.95.63-1.83 1.63-1.83.99 0 1.25.74 1.25 1.79V17H19v-3.9c0-2.05-1.05-3.1-2.98-3.1z" fill="white"/>
    </svg>
  );
}

export function OAuthButtons({ label = "Or continue with" }: OAuthButtonsProps) {
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

  const btnBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    width: "100%",
    padding: "11px 16px",
    borderRadius: "12px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all .18s",
    background: "rgba(255,255,255,.07)",
    border: "1.5px solid rgba(255,255,255,.12)",
    color: "rgba(255,255,255,.85)",
    outline: "none",
  };

  return (
    <div className="space-y-3">
      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,.08)" }} />
        <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,.3)" }}>{label}</span>
        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,.08)" }} />
      </div>

      {/* Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={!!loadingProvider}
          onClick={() => signInWith("google")}
          style={btnBase}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.12)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.2)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.07)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.12)"; }}
        >
          {loadingProvider === "google"
            ? <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            : <GoogleIcon />
          }
          Google
        </button>

        <button
          type="button"
          disabled={!!loadingProvider}
          onClick={() => signInWith("linkedin_oidc")}
          style={btnBase}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.12)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.2)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.07)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.12)"; }}
        >
          {loadingProvider === "linkedin_oidc"
            ? <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            : <LinkedInIcon />
          }
          LinkedIn
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
