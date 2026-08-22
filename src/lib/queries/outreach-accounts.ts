"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  unipileConfigured,
  createHostedAuthLink,
  listUnipileAccounts,
  unipileDeleteAccount,
  createWhatsAppAccount,
  getUnipileAccount,
} from "@/lib/outreach/unipile";
import { requireSuperAdmin } from "@/lib/queries/auth-guards";
import { logAudit } from "@/lib/queries/audit-log";

export interface OutreachAccountRow {
  id: string;
  provider: string;
  channel: "email" | "linkedin" | "whatsapp";
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

/**
 * Deletes any locally-stored Unipile account rows that no longer exist on
 * Unipile's side (trial reset, manually removed there, etc.) — without this,
 * a stale row keeps showing "Connected" forever since nothing ever re-checks
 * it against the real Unipile account list. Fails silently on network errors
 * so a Unipile hiccup never wipes out otherwise-valid local rows.
 */
async function pruneDeadUnipileAccounts(supabase: Awaited<ReturnType<typeof createClient>>, liveAccounts?: { id: string }[]): Promise<void> {
  if (!unipileConfigured) return;
  try {
    const live = liveAccounts ?? (await listUnipileAccounts());
    const liveIds = live.map((a) => a.id).filter(Boolean);
    let q = supabase.from("outreach_accounts").delete().eq("provider", "unipile");
    if (liveIds.length) q = q.not("account_id", "in", `(${liveIds.join(",")})`);
    await q;
  } catch {
    // Unipile unreachable — leave local rows as-is rather than guessing.
  }
}

/** Whether this workspace has at least one connected email mailbox — used by the
 * onboarding hard gate. Fails open (returns true) on a query error so a DB
 * hiccup here can never lock a workspace out of the whole app. */
export async function hasConnectedMailbox(): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("outreach_accounts")
    .select("id", { count: "exact", head: true })
    .eq("channel", "email")
    .eq("status", "connected");
  if (error) return true;
  return (count ?? 0) > 0;
}

/** Whether this workspace has at least one connected LinkedIn account —
 * LinkedIn is an optional connect (unlike mailbox), so this fails closed on a
 * query error rather than open. */
export async function hasConnectedLinkedIn(): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("outreach_accounts")
    .select("id", { count: "exact", head: true })
    .eq("channel", "linkedin")
    .eq("status", "connected");
  if (error) return false;
  return (count ?? 0) > 0;
}

/** Whether this workspace can send a campaign at all — at least one connected
 *  mailbox OR LinkedIn account. Used to gate campaign create/edit/launch. */
export async function hasConnectedOutreachChannel(): Promise<boolean> {
  const [mailbox, linkedin] = await Promise.all([hasConnectedMailbox(), hasConnectedLinkedIn()]);
  return mailbox || linkedin;
}

export async function getOutreachAccounts(): Promise<OutreachAccountRow[]> {
  const supabase = await createClient();
  await pruneDeadUnipileAccounts(supabase);
  const { data } = await supabase
    .from("outreach_accounts")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

/**
 * Returns a Unipile hosted-auth URL the user opens to connect a mailbox or
 * LinkedIn account. After they authorize, Unipile redirects back to
 * `returnTo` (defaults to /outreach) with `?connected=<channel>` appended, and
 * the landing page calls syncOutreachAccounts() to store it. Pass the actual
 * page the user initiated the connect from (e.g. Settings > Connectors) so
 * they land back where they started already showing the fresh connection,
 * instead of on an unrelated page that never gets revalidated.
 */
export async function connectOutreachAccount(channel: "email" | "linkedin", returnTo = "/outreach"): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Forbidden" };
  }
  if (!unipileConfigured) {
    return { ok: false, error: "Unipile is not configured. Add UNIPILE_DSN and UNIPILE_API_KEY to your environment." };
  }
  const supabase = await createClient();

  // Clear out any rows for accounts Unipile no longer has (trial reset, etc.)
  // before enforcing the cap below — otherwise a dead account blocks reconnecting
  // forever, since nothing else ever re-checks it.
  await pruneDeadUnipileAccounts(supabase);

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
  const sep = returnTo.includes("?") ? "&" : "?";
  try {
    const { url } = await createHostedAuthLink({
      providers: channel,
      successUrl: `${appUrl()}${returnTo}${sep}connected=${channel}`,
      failureUrl: `${appUrl()}${returnTo}${sep}connect_error=1`,
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
      const channel: "email" | "linkedin" | "whatsapp" = a.type === "LINKEDIN" ? "linkedin" : a.type === "WHATSAPP" ? "whatsapp" : "email";
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
    await pruneDeadUnipileAccounts(supabase, accounts);

    revalidatePath("/outreach");
    revalidatePath("/campaigns");
    revalidatePath("/settings");
    return { ok: true, count };
  } catch (err) {
    return { ok: false, count: 0, error: err instanceof Error ? err.message : "Sync failed" };
  }
}

/**
 * Connects the workspace's shared WhatsApp number via Unipile's native QR /
 * pairing-code flow (there's no hosted-auth-link option for WhatsApp). Pass a
 * phone number (E.164) to get a short pairing code to type into WhatsApp, or
 * omit it to get a QR code to scan instead. Same one-account-per-channel cap
 * and Super-Admin guard as connectOutreachAccount(). The returned row is a
 * "connecting" placeholder — checkWhatsAppConnection() polls it to "connected".
 */
export async function connectWhatsAppAccount(phoneNumber?: string): Promise<
  { ok: false; error: string } | { ok: true; accountId: string; qrCode?: string; pairingCode?: string }
> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Forbidden" };
  }
  if (!unipileConfigured) {
    return { ok: false, error: "Unipile is not configured. Add UNIPILE_DSN and UNIPILE_API_KEY to your environment." };
  }
  const supabase = await createClient();
  await pruneDeadUnipileAccounts(supabase);

  const { count } = await supabase
    .from("outreach_accounts")
    .select("id", { count: "exact", head: true })
    .eq("channel", "whatsapp");
  if ((count ?? 0) >= 1) {
    return { ok: false, error: "A WhatsApp number is already connected. Disconnect it first to change numbers." };
  }

  try {
    const { accountId, status, qrCode, pairingCode } = await createWhatsAppAccount(phoneNumber);
    if (!accountId) return { ok: false, error: "Unipile did not return an account id" };

    // Supabase-js never throws on a failed insert (RLS denial, constraint
    // violation, etc.) — it resolves with { error } instead. Not checking that
    // error here previously meant a Unipile-side success (account genuinely
    // created and connected) could silently fail to save locally: the UI would
    // report "connected" while outreach_accounts stayed empty, with no way to
    // tell the two apart. Checking it now surfaces the real failure instead.
    const { error } = await supabase.from("outreach_accounts").insert({
      provider: "unipile",
      channel: "whatsapp",
      account_id: accountId,
      name: phoneNumber || null,
      identifier: phoneNumber || null,
      status: status === "connected" ? "connected" : "connecting",
    });
    if (error) {
      // The Unipile-side account now exists but isn't tracked locally — clean
      // it up so a retry doesn't collide with an orphaned remote account.
      await unipileDeleteAccount(accountId).catch(() => {});
      return { ok: false, error: `Connected on WhatsApp's side, but couldn't save it: ${error.message}` };
    }
    await logAudit({ action: "connector.connected", entityType: "outreach_account", entityLabel: phoneNumber || "WhatsApp", metadata: { channel: "whatsapp" } });
    revalidatePath("/admin");
    return { ok: true, accountId, qrCode, pairingCode };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to start WhatsApp connection" };
  }
}

/** Polls Unipile for a connecting WhatsApp account's real status, and syncs
 *  the local row once it reports connected — the QR/pairing-code UI calls
 *  this on an interval until it returns "connected". */
export async function checkWhatsAppConnection(accountId: string): Promise<{ status: string }> {
  if (!unipileConfigured) return { status: "unknown" };
  try {
    const data = await getUnipileAccount(accountId);
    const raw = String(data.status ?? "");
    const connected = raw.toUpperCase().includes("OK") || raw.toUpperCase() === "CONNECTED";
    const status = connected ? "connected" : raw ? raw.toLowerCase() : "connecting";
    const supabase = await createClient();
    await supabase.from("outreach_accounts").update({ status, updated_at: new Date().toISOString() }).eq("account_id", accountId);
    if (connected) revalidatePath("/admin");
    return { status };
  } catch {
    return { status: "connecting" };
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
