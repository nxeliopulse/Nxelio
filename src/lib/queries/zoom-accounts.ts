"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { refreshZoomToken, createZoomMeeting } from "@/lib/zoom/client";
import { zoomConfigured } from "@/lib/zoom/config";
import { requireSuperAdmin } from "@/lib/queries/auth-guards";
import { logAudit } from "@/lib/queries/audit-log";

export interface ZoomAccountRow {
  id: string;
  email: string | null;
  status: string;
  created_at: string;
}

/** Whether Zoom OAuth credentials are configured — drives the connect UI. */
export async function getZoomProviderStatus(): Promise<boolean> {
  return zoomConfigured();
}

/** Connected Zoom accounts for the current workspace (no tokens exposed). */
export async function getZoomAccounts(): Promise<ZoomAccountRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("zoom_accounts")
    .select("id, email, status, created_at")
    .order("created_at", { ascending: false });
  return (data as ZoomAccountRow[]) ?? [];
}

export async function disconnectZoom(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Forbidden" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("zoom_accounts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  await logAudit({ action: "zoom.disconnected", entityType: "zoom_account", entityId: id });
  return { ok: true };
}

interface ZoomAccountWithTokens {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}

async function ensureZoomAccessToken(acc: ZoomAccountWithTokens): Promise<string> {
  const valid = acc.token_expires_at && new Date(acc.token_expires_at).getTime() > Date.now();
  if (acc.access_token && valid) return acc.access_token;
  if (!acc.refresh_token) {
    if (acc.access_token) return acc.access_token;
    throw new Error("Session expired — please reconnect Zoom");
  }
  const t = await refreshZoomToken(acc.refresh_token);
  const admin = createAdminClient();
  await admin
    .from("zoom_accounts")
    .update({
      access_token: t.accessToken,
      refresh_token: t.refreshToken || acc.refresh_token,
      token_expires_at: t.expiresAt,
    })
    .eq("id", acc.id);
  return t.accessToken;
}

export interface CreateZoomLinkInput {
  title: string;
  startIso: string;
  endIso: string;
}

export type CreateZoomLinkResult = { ok: true; joinUrl: string } | { ok: false; error: string };

const ZOOM_NOT_CONNECTED_ERROR = "Connect Zoom in Settings → Calendar to generate a real Zoom link.";

/** Real Zoom meeting link for the current logged-in user's workspace (dashboard meeting creation). */
export async function createZoomMeetingLink(input: CreateZoomLinkInput): Promise<CreateZoomLinkResult> {
  const supabase = await createClient();
  const { data: acc } = await supabase
    .from("zoom_accounts")
    .select("id, access_token, refresh_token, token_expires_at")
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();
  if (!acc) return { ok: false, error: ZOOM_NOT_CONNECTED_ERROR };
  try {
    const token = await ensureZoomAccessToken(acc as ZoomAccountWithTokens);
    const evt = await createZoomMeeting(token, { title: input.title, startIso: input.startIso, endIso: input.endIso });
    return { ok: true, joinUrl: evt.joinUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create Zoom meeting" };
  }
}
