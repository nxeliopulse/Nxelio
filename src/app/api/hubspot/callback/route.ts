/**
 * GET /api/hubspot/callback
 * OAuth redirect target: verifies CSRF state, exchanges the code for tokens,
 * resolves the portal identity, and stores the connection on the workspace.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeHubspotCode, fetchHubspotPortalInfo } from "@/lib/hubspot/client";
import { logAudit } from "@/lib/queries/audit-log";

export async function GET(req: NextRequest) {
  const nextCookie = req.cookies.get("hubspot_next")?.value;
  const next = nextCookie && nextCookie.startsWith("/") && !nextCookie.startsWith("//") ? nextCookie : "/settings?section=integrations";
  const sep = next.includes("?") ? "&" : "?";
  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`${next}${sep}hubspot_error=${encodeURIComponent(msg)}`, req.url));

  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthErr = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (oauthErr) return fail(oauthErr);
  if (!code) return fail("No authorization code was returned");

  const cookieState = req.cookies.get("hubspot_state")?.value;
  if (!cookieState || cookieState !== state) return fail("Invalid or expired state — please try connecting again");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const tokens = await exchangeHubspotCode(code);
    const portal = await fetchHubspotPortalInfo(tokens.accessToken);
    // workspace_id is filled by the auto_workspace_trigger on insert.
    const { error } = await supabase.from("hubspot_accounts").upsert(
      {
        portal_id: portal.portalId,
        hub_domain: portal.hubDomain,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken ?? null,
        token_expires_at: tokens.expiresAt,
        scope: tokens.scope ?? null,
        status: "connected",
      },
      { onConflict: "workspace_id" }
    );
    if (error) return fail(error.message);
    await logAudit({ action: "hubspot.connected", entityType: "hubspot_account", entityLabel: portal.hubDomain ?? undefined });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "HubSpot connection failed");
  }

  const res = NextResponse.redirect(new URL(`${next}${sep}connected=hubspot`, req.url));
  res.cookies.delete("hubspot_state");
  res.cookies.delete("hubspot_next");
  return res;
}
