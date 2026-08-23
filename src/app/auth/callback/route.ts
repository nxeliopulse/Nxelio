import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOnboardingStatus } from "@/lib/queries/onboarding";

/**
 * Auth callback — shared by OAuth sign-in (Google/LinkedIn) AND the
 * password-reset email link (forgot-password/page.tsx points
 * resetPasswordForEmail's redirectTo here too). Branch on the exchanged
 * session's provider, not on request shape, so the reset-password path keeps
 * working exactly as before regardless of the OAuth routing added below.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  // Only allow same-origin relative paths — an absolute or protocol-relative
  // `next` (e.g. https://evil.com or //evil.com) would be an open redirect.
  const rawNext = url.searchParams.get("next") || "/dashboard";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (!code) {
    const redirect = url.clone();
    redirect.pathname = "/login";
    redirect.search = "?error=invalid_link";
    return NextResponse.redirect(redirect);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    const redirect = url.clone();
    redirect.pathname = "/login";
    redirect.search = `?error=${encodeURIComponent(error?.message || "Sign-in failed")}`;
    return NextResponse.redirect(redirect);
  }

  const user = data.user;
  const provider = user.app_metadata?.provider;

  if (provider === "google" || provider === "linkedin_oidc") {
    // No explicit is_new_user flag on the session — this is the standard
    // Supabase heuristic: a brand-new account's first sign-in timestamp is
    // (near-)identical to its creation timestamp; a returning user's isn't.
    const createdMs = new Date(user.created_at).getTime();
    const lastSignInMs = new Date(user.last_sign_in_at ?? user.created_at).getTime();
    const isBrandNew = Math.abs(lastSignInMs - createdMs) < 10_000;

    if (isBrandNew) {
      return NextResponse.redirect(new URL("/onboarding", url.origin));
    }

    // Returning OAuth user — best-effort backfill avatar_url for accounts
    // created before this migration shipped (the signup trigger only runs
    // once, at row creation). Narrow WHERE avatar_url IS NULL so it never
    // clobbers a value the user changed later.
    const meta = user.user_metadata as Record<string, unknown> | undefined;
    const identityData = user.identities?.[0]?.identity_data as Record<string, unknown> | undefined;
    const picture =
      (meta?.avatar_url as string | undefined) ??
      (meta?.picture as string | undefined) ??
      (identityData?.avatar_url as string | undefined) ??
      (identityData?.picture as string | undefined) ??
      null;
    if (picture) {
      await supabase.from("users").update({ avatar_url: picture }).eq("user_id", user.id).is("avatar_url", null);
    }

    // Subscription status is deliberately NOT checked here — that stays
    // (app)/layout.tsx's sole responsibility. Falls back to /dashboard on any
    // failure here — the user is already authenticated, and (app)/layout.tsx
    // re-checks onboarding/subscription on every request anyway, so this can
    // never let someone bypass the gate, just avoids a 500 for a transient hiccup.
    try {
      const status = await getOnboardingStatus();
      return NextResponse.redirect(new URL(status.completed ? "/dashboard" : "/onboarding", url.origin));
    } catch {
      return NextResponse.redirect(new URL("/dashboard", url.origin));
    }
  }

  // Any other provider (email/password reset link, or anything else riding
  // this shared route) — unchanged, existing behavior.
  return NextResponse.redirect(new URL(next, url.origin));
}
