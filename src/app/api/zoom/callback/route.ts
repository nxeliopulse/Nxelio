/**
 * GET /api/zoom/callback
 * OAuth redirect target: verifies CSRF state, exchanges the code for tokens,
 * resolves the account email, and stores the connection on the workspace.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeZoomCode, fetchZoomEmail } from "@/lib/zoom/client";
import { logAudit } from "@/lib/queries/audit-log";

export async function GET(req: NextRequest) {
  // The connect route stashed where we should return to (Settings by default,
  // or e.g. onboarding if that's where the user started) — read it before any
  // early return so both the success and failure paths land back there
  // instead of always bouncing to Settings regardless of where this began.
  const nextCookie = req.cookies.get("zoom_next")?.value;
  const next = nextCookie && nextCookie.startsWith("/") && !nextCookie.startsWith("//") ? nextCookie : "/settings?section=calendar";
  const sep = next.includes("?") ? "&" : "?";
  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`${next}${sep}calendar_error=${encodeURIComponent(msg)}`, req.url));

  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthErr = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (oauthErr) return fail(oauthErr);
  if (!code) return fail("No authorization code was returned");

  const cookieState = req.cookies.get("zoom_state")?.value;
  if (!cookieState || cookieState !== state) return fail("Invalid or expired state — please try connecting again");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const tokens = await exchangeZoomCode(code);
    const email = await fetchZoomEmail(tokens.accessToken);
    // workspace_id is filled by the auto_workspace_trigger on insert.
    const { error } = await supabase.from("zoom_accounts").upsert(
      {
        email,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken ?? null,
        token_expires_at: tokens.expiresAt,
        scope: tokens.scope ?? null,
        status: "connected",
      },
      { onConflict: "workspace_id,email" }
    );
    if (error) return fail(error.message);
    await logAudit({ action: "zoom.connected", entityType: "zoom_account", entityLabel: email ?? undefined });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Zoom connection failed");
  }

  const res = NextResponse.redirect(new URL(`${next}${sep}connected=zoom`, req.url));
  res.cookies.delete("zoom_state");
  res.cookies.delete("zoom_next");
  return res;
}
