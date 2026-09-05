"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { refreshHubspotToken } from "@/lib/hubspot/client";
import { hubspotAppConfigured } from "@/lib/hubspot/config";
import { requireSuperAdmin } from "@/lib/queries/auth-guards";
import { logAudit } from "@/lib/queries/audit-log";

export interface HubspotAccountRow {
  id: string;
  portal_id: string | null;
  hub_domain: string | null;
  status: string;
  created_at: string;
}

/** Whether HubSpot OAuth app credentials are configured — drives the connect UI. */
export async function getHubspotProviderStatus(): Promise<boolean> {
  return hubspotAppConfigured();
}

/** The current workspace's connected HubSpot account, if any (no tokens exposed). */
export async function getHubspotAccount(): Promise<HubspotAccountRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hubspot_accounts")
    .select("id, portal_id, hub_domain, status, created_at")
    .maybeSingle();
  return (data as HubspotAccountRow) ?? null;
}

export async function disconnectHubspot(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Forbidden" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("hubspot_accounts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  await logAudit({ action: "hubspot.disconnected", entityType: "hubspot_account", entityId: id });
  return { ok: true };
}

interface HubspotAccountWithTokens {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}

async function ensureHubspotAccessToken(acc: HubspotAccountWithTokens): Promise<string> {
  const valid = acc.token_expires_at && new Date(acc.token_expires_at).getTime() > Date.now();
  if (acc.access_token && valid) return acc.access_token;
  if (!acc.refresh_token) {
    if (acc.access_token) return acc.access_token;
    throw new Error("Session expired — please reconnect HubSpot");
  }
  const t = await refreshHubspotToken(acc.refresh_token);
  const admin = createAdminClient();
  await admin
    .from("hubspot_accounts")
    .update({
      access_token: t.accessToken,
      refresh_token: t.refreshToken || acc.refresh_token,
      token_expires_at: t.expiresAt,
    })
    .eq("id", acc.id);
  return t.accessToken;
}

const HUBSPOT_NOT_CONNECTED_ERROR = "Connect HubSpot in Settings → Integrations to sync leads.";

/** A valid access token for the current workspace's connected HubSpot account, refreshing if needed. */
export async function getWorkspaceHubspotToken(): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: acc } = await supabase
    .from("hubspot_accounts")
    .select("id, access_token, refresh_token, token_expires_at")
    .eq("status", "connected")
    .maybeSingle();
  if (!acc) return { ok: false, error: HUBSPOT_NOT_CONNECTED_ERROR };
  try {
    const accessToken = await ensureHubspotAccessToken(acc as HubspotAccountWithTokens);
    return { ok: true, accessToken };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to refresh HubSpot connection" };
  }
}
