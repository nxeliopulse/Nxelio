/**
 * GET /api/zoom/connect
 * Starts the Zoom OAuth flow: sets a short-lived CSRF state cookie and
 * redirects to Zoom's consent screen. The callback finishes the connection.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { buildZoomAuthUrl } from "@/lib/zoom/client";
import { zoomConfigured } from "@/lib/zoom/config";

export async function GET(req: NextRequest) {
  const settings = (q: string) => NextResponse.redirect(new URL(`/settings?section=calendar&${q}`, req.url));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const admin = createAdminClient();
  const { data: callerProfile } = await admin.from("users").select("role_id").eq("user_id", user.id).single();
  if (callerProfile?.role_id !== 1) {
    return settings("calendar_error=" + encodeURIComponent("Only a Super Admin can connect Zoom."));
  }

  if (!zoomConfigured()) {
    return settings("calendar_error=" + encodeURIComponent("Zoom isn't configured yet (missing OAuth credentials)."));
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildZoomAuthUrl(state));
  res.cookies.set("zoom_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
