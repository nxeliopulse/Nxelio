/**
 * GET /api/calendar/{google|microsoft}/callback
 * OAuth redirect target: verifies CSRF state, exchanges the code for tokens,
 * resolves the mailbox email, and stores the connection on the workspace.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, fetchAccountEmail, type CalProvider } from "@/lib/calendar/providers";
import { logAudit } from "@/lib/queries/audit-log";

function isProvider(p: string): p is CalProvider {
  return p === "google" || p === "microsoft";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;

  // The connect route stashed where we should return to (Settings by default,
  // or e.g. onboarding if that's where the user started) — read it before any
  // early return so both the success and failure paths land back there
  // instead of always bouncing to Settings regardless of where this began.
  const nextCookie = isProvider(provider) ? req.cookies.get(`cal_next_${provider}`)?.value : undefined;
  const next = nextCookie && nextCookie.startsWith("/") && !nextCookie.startsWith("//") ? nextCookie : "/settings?section=calendar";
  const sep = next.includes("?") ? "&" : "?";
  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`${next}${sep}calendar_error=${encodeURIComponent(msg)}`, req.url));

  if (!isProvider(provider)) return fail("Unknown calendar provider");

  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthErr = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (oauthErr) return fail(oauthErr);
  if (!code) return fail("No authorization code was returned");

  const cookieState = req.cookies.get(`cal_state_${provider}`)?.value;
  if (!cookieState || cookieState !== state) return fail("Invalid or expired state — please try connecting again");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const tokens = await exchangeCode(provider, code);
    const email = await fetchAccountEmail(provider, tokens.accessToken);
    // workspace_id is filled by the auto_workspace_trigger on insert.
    const { error } = await supabase.from("calendar_accounts").upsert(
      {
        provider,
        email,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken ?? null,
        token_expires_at: tokens.expiresAt,
        scope: tokens.scope ?? null,
        status: "connected",
      },
      { onConflict: "workspace_id,provider,email" }
    );
    if (error) return fail(error.message);
    await logAudit({ action: "calendar.connected", entityType: "calendar_account", entityLabel: email ?? undefined, metadata: { provider } });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Calendar connection failed");
  }

  const res = NextResponse.redirect(new URL(`${next}${sep}connected=calendar`, req.url));
  res.cookies.delete(`cal_state_${provider}`);
  res.cookies.delete(`cal_next_${provider}`);
  return res;
}
