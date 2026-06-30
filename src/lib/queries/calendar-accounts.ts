"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { refreshAccessToken, fetchBusy, type CalProvider, type BusyInterval } from "@/lib/calendar/providers";
import { calendarConfigured } from "@/lib/calendar/config";

export interface CalendarAccountRow {
  id: string;
  provider: CalProvider;
  email: string | null;
  status: string;
  created_at: string;
}

/** Which providers are configured (have OAuth credentials) — drives the connect UI. */
export async function getCalendarProviderStatus(): Promise<{ google: boolean; microsoft: boolean }> {
  return { google: calendarConfigured("google"), microsoft: calendarConfigured("microsoft") };
}

/** Connected calendar accounts for the current workspace (no tokens exposed). */
export async function getCalendarAccounts(): Promise<CalendarAccountRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("calendar_accounts")
    .select("id, provider, email, status, created_at")
    .order("created_at", { ascending: false });
  return (data as CalendarAccountRow[]) ?? [];
}

export async function disconnectCalendar(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_accounts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

interface AccountWithTokens {
  id: string;
  provider: CalProvider;
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}

/** Returns a valid access token, refreshing + persisting it when expired. */
async function ensureToken(acc: AccountWithTokens): Promise<string> {
  const valid = acc.token_expires_at && new Date(acc.token_expires_at).getTime() > Date.now();
  if (acc.access_token && valid) return acc.access_token;
  if (!acc.refresh_token) {
    if (acc.access_token) return acc.access_token;
    throw new Error("Session expired — please reconnect this calendar");
  }
  const t = await refreshAccessToken(acc.provider, acc.refresh_token);
  // Write tokens with the admin client so it works even outside an RLS-friendly context.
  const admin = createAdminClient();
  await admin
    .from("calendar_accounts")
    .update({
      access_token: t.accessToken,
      refresh_token: t.refreshToken || acc.refresh_token, // Google may omit a new one
      token_expires_at: t.expiresAt,
    })
    .eq("id", acc.id);
  return t.accessToken;
}

/**
 * Reads merged busy intervals across all connected calendars between two ISO
 * timestamps. This is the "availability syncs automatically" half of LP-3 — the
 * scheduler (Epic 4) will consume this to offer free slots.
 */
export async function getCalendarBusy(startIso: string, endIso: string): Promise<{ busy: BusyInterval[]; errors: string[] }> {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("calendar_accounts")
    .select("id, provider, email, access_token, refresh_token, token_expires_at")
    .eq("status", "connected");

  const busy: BusyInterval[] = [];
  const errors: string[] = [];
  for (const acc of (accounts as AccountWithTokens[]) || []) {
    try {
      const token = await ensureToken(acc);
      busy.push(...(await fetchBusy(acc.provider, token, acc.email, startIso, endIso)));
    } catch (e) {
      errors.push(`${acc.provider}${acc.email ? ` (${acc.email})` : ""}: ${e instanceof Error ? e.message : "sync failed"}`);
    }
  }
  busy.sort((a, b) => a.start.localeCompare(b.start));
  return { busy, errors };
}

/**
 * Like getCalendarBusy but for a specific workspace via the admin client — used
 * by the PUBLIC booking page (LP-20), where there's no logged-in session.
 */
export async function getWorkspaceBusy(workspaceId: string, startIso: string, endIso: string): Promise<BusyInterval[]> {
  const admin = createAdminClient();
  const { data: accounts } = await admin
    .from("calendar_accounts")
    .select("id, provider, email, access_token, refresh_token, token_expires_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "connected");

  const busy: BusyInterval[] = [];
  for (const acc of (accounts as AccountWithTokens[]) || []) {
    try {
      const token = await ensureToken(acc);
      busy.push(...(await fetchBusy(acc.provider, token, acc.email, startIso, endIso)));
    } catch { /* skip a failing calendar; a booking page should still show slots */ }
  }
  return busy;
}
