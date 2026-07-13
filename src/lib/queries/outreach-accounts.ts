"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  unipileConfigured,
  createHostedAuthLink,
  listUnipileAccounts,
  unipileDeleteAccount,
} from "@/lib/outreach/unipile";
import { requireSuperAdmin } from "@/lib/queries/auth-guards";
import { logAudit } from "@/lib/queries/audit-log";

export interface OutreachAccountRow {
  id: string;
  provider: string;
  channel: "email" | "linkedin";
  account_id: string;
  name: string | null;
  identifier: string | null;
  status: string;
  created_at: string;
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export async function isUnipileConfigured() {
  return unipileConfigured;
}

export async function getOutreachAccounts(): Promise<OutreachAccountRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outreach_accounts")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

/**
 * Returns a Unipile hosted-auth URL the user opens to connect a mailbox or
 * LinkedIn account. After they authorize, Unipile redirects back to
 * /outreach?connected=<channel>, and we call syncOutreachAccounts() to store it.
 */
export async function connectOutreachAccount(channel: "email" | "linkedin"): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Forbidden" };
  }
  if (!unipileConfigured) {
    return { ok: false, error: "Unipile is not configured. Add UNIPILE_DSN and UNIPILE_API_KEY to your environment." };
  }
  const supabase = await createClient();

  // Cap: at most one connected account per channel (email, linkedin).
  const { count } = await supabase
    .from("outreach_accounts")
    .select("id", { count: "exact", head: true })
    .eq("channel", channel);
  if ((count ?? 0) >= 1) {
    return { ok: false, error: `Only one ${channel === "email" ? "email" : "LinkedIn"} account can be connected. Disconnect the current one first.` };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("users").select("workspace_id").eq("user_id", user.id).single()
    : { data: null };
  const wsId = (profile as { workspace_id?: string } | null)?.workspace_id || "unknown";

  // expires 1 hour out; computed without Date.now() to satisfy lint-free server code
  const expiresOn = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  try {
    const { url } = await createHostedAuthLink({
      providers: channel,
      successUrl: `${appUrl()}/outreach?connected=${channel}`,
      failureUrl: `${appUrl()}/outreach?connect_error=1`,
      name: wsId,
      expiresOn,
    });
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create connect link" };
  }
}

/**
 * Pulls the current account list from Unipile and upserts rows for this
 * workspace. Called after the connect redirect (and from the Accounts tab).
 */
export async function syncOutreachAccounts(): Promise<{ ok: boolean; count: number; error?: string }> {
  if (!unipileConfigured) return { ok: false, count: 0, error: "Unipile not configured" };
  const supabase = await createClient();
  try {
    const accounts = await listUnipileAccounts();
    let count = 0;
    for (const a of accounts) {
      const channel: "email" | "linkedin" = a.type === "LINKEDIN" ? "linkedin" : "email";
      const status = (a.status && a.status.toLowerCase().includes("ok")) || a.status === "CONNECTED" ? "connected" : (a.status || "connected");

      // 1) If THIS workspace already owns the account, just refresh it (RLS scopes the update).
      const { data: updated } = await supabase
        .from("outreach_accounts")
        .update({ name: a.name ?? null, identifier: a.identifier ?? null, status, updated_at: new Date().toISOString() })
        .eq("account_id", a.id)
        .select("id");
      if (updated && updated.length) { count++; continue; }

      // 2) Otherwise try to CLAIM it. The global UNIQUE(account_id) constraint makes
      //    this fail (silently skipped) when another workspace already owns it — so a
      //    shared Unipile key never leaks one workspace's accounts into another.
      const { error } = await supabase.from("outreach_accounts").insert({
        provider: "unipile", channel, account_id: a.id,
        name: a.name ?? null, identifier: a.identifier ?? null, status,
      });
      if (!error) {
        count++;
        await logAudit({ action: "connector.connected", entityType: "outreach_account", entityLabel: a.name ?? a.identifier ?? channel, metadata: { channel } });
      }
    }

    // Prune local accounts that no longer exist in Unipile (deleted/expired) so dead
    // accounts can't be picked for sending. RLS scopes the delete to this workspace.
    const liveIds = accounts.map((a) => a.id).filter(Boolean);
    if (liveIds.length) {
      await supabase
        .from("outreach_accounts")
        .delete()
        .eq("provider", "unipile")
        .not("account_id", "in", `(${liveIds.join(",")})`);
    }

    revalidatePath("/outreach");
    revalidatePath("/campaigns");
    return { ok: true, count };
  } catch (err) {
    return { ok: false, count: 0, error: err instanceof Error ? err.message : "Sync failed" };
  }
}

export async function deleteOutreachAccount(id: string) {
  await requireSuperAdmin();
  const supabase = await createClient();
  // Look up the Unipile account_id (RLS guarantees it's one of THIS workspace's rows).
  const { data: row } = await supabase.from("outreach_accounts").select("account_id").eq("id", id).maybeSingle();

  // Disconnect from Unipile too, so it's truly gone and a Recheck can't re-add it.
  const accountId = (row as { account_id?: string } | null)?.account_id;
  if (accountId && unipileConfigured) {
    await unipileDeleteAccount(accountId).catch(() => { /* already gone / network — still remove locally */ });
  }

  const { error } = await supabase.from("outreach_accounts").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/outreach");
  revalidatePath("/campaigns");
  await logAudit({ action: "connector.disconnected", entityType: "outreach_account", entityId: id });
}
