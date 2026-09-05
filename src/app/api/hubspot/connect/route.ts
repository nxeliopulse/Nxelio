/**
 * GET /api/hubspot/connect
 * Starts the HubSpot OAuth flow: sets a short-lived CSRF state cookie and
 * redirects to HubSpot's consent screen. The callback finishes the connection.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { buildHubspotAuthUrl } from "@/lib/hubspot/client";
import { hubspotAppConfigured } from "@/lib/hubspot/config";

export async function GET(req: NextRequest) {
  const settings = (q: string) => NextResponse.redirect(new URL(`/settings?section=integrations&${q}`, req.url));

  const rawNext = req.nextUrl.searchParams.get("next") || "/settings?section=integrations";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/settings?section=integrations";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const admin = createAdminClient();
  const { data: callerProfile } = await admin.from("users").select("role_id").eq("user_id", user.id).single();
  if (callerProfile?.role_id !== 1) {
    return settings("hubspot_error=" + encodeURIComponent("Only a Super Admin can connect HubSpot."));
  }

  if (!hubspotAppConfigured()) {
    return settings("hubspot_error=" + encodeURIComponent("HubSpot isn't configured yet (missing OAuth credentials)."));
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildHubspotAuthUrl(state));
  res.cookies.set("hubspot_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  res.cookies.set("hubspot_next", next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
