/**
 * GET /api/calendar/{google|microsoft}/connect
 * Starts the OAuth flow: sets a short-lived CSRF state cookie and redirects the
 * user to the provider's consent screen. The callback finishes the connection.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { buildAuthUrl, type CalProvider } from "@/lib/calendar/providers";
import { calendarConfigured } from "@/lib/calendar/config";

function isProvider(p: string): p is CalProvider {
  return p === "google" || p === "microsoft";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const settings = (q: string) => NextResponse.redirect(new URL(`/settings?section=calendar&${q}`, req.url));

  if (!isProvider(provider)) return settings("calendar_error=" + encodeURIComponent("Unknown calendar provider"));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const admin = createAdminClient();
  const { data: callerProfile } = await admin.from("users").select("role_id").eq("user_id", user.id).single();
  if (callerProfile?.role_id !== 1) {
    return settings("calendar_error=" + encodeURIComponent("Only a Super Admin can connect a calendar."));
  }

  if (!calendarConfigured(provider)) {
    return settings("calendar_error=" + encodeURIComponent(`${provider} calendar isn't configured yet (missing OAuth credentials).`));
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildAuthUrl(provider, state));
  res.cookies.set(`cal_state_${provider}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
