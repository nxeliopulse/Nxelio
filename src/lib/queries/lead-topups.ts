"use server";

import { createClient } from "@/lib/supabase/server";
import { chargebee, LEAD_TOPUP_PRICE_CENTS, LEAD_TOPUP_LEADS } from "@/lib/chargebee";

export interface LeadTopUpResult {
  ok: boolean;
  error?: string;
  leadsGranted?: number;
  topupLeadsRemaining?: number;
}

/** Start of the current calendar month, as an ISO string. */
function currentMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

/** Lead Top-Ups only make sense on plans that have the lead-discovery feature. */
const TOPUP_ELIGIBLE_PLANS = new Set(["starter", "pro"]);

/**
 * Whether this workspace still has its one lead top-up available for the
 * current calendar month (regardless of monthly vs. annual billing). Always
 * false on Basic — Basic has no lead-discovery allowance to top up.
 */
export async function canPurchaseLeadTopUpThisMonth(): Promise<boolean> {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("users").select("workspace_id").single();
  if (!profile) return false;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan_id")
    .eq("workspace_id", profile.workspace_id)
    .single();
  if (!sub || !TOPUP_ELIGIBLE_PLANS.has(sub.plan_id)) return false;

  const { count } = await supabase
    .from("credit_top_ups")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", profile.workspace_id)
    .eq("resource_type", "leads")
    .gte("created_at", currentMonthStart());

  return (count ?? 0) === 0;
}

/**
 * Charges the workspace's card on file (via Chargebee, no hosted-page
 * redirect needed) for a one-time $149 / 1,000-lead top-up, then instantly
 * grants the leads. Starter and Pro plans only (Basic has no lead-discovery
 * allowance to top up) — limited to ONE top-up per calendar month; buying
 * another requires waiting until next month.
 */
export async function purchaseLeadTopUp(): Promise<LeadTopUpResult> {
  const supabase = await createClient();

  const { data: profile } = await supabase.from("users").select("workspace_id").single();
  if (!profile) return { ok: false, error: "User profile not found" };

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("chargebee_customer_id, status, plan_id")
    .eq("workspace_id", profile.workspace_id)
    .single();

  if (!sub?.chargebee_customer_id) {
    return { ok: false, error: "No payment method on file — subscribe to a plan first." };
  }
  if (sub.status !== "active" && sub.status !== "trialing") {
    return { ok: false, error: "Your subscription must be active to purchase a lead top-up." };
  }
  if (!TOPUP_ELIGIBLE_PLANS.has(sub.plan_id)) {
    return { ok: false, error: "Lead Top-Ups are available on Starter and Pro plans. Upgrade to buy extra leads." };
  }

  const { count: usedThisMonth } = await supabase
    .from("credit_top_ups")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", profile.workspace_id)
    .eq("resource_type", "leads")
    .gte("created_at", currentMonthStart());

  if ((usedThisMonth ?? 0) > 0) {
    return { ok: false, error: "You've already purchased a lead top-up this month. You can buy another starting next month." };
  }

  let invoiceId: string;
  try {
    const cb = chargebee();
    const result = await cb.invoice
      .charge({
        customer_id: sub.chargebee_customer_id,
        amount: LEAD_TOPUP_PRICE_CENTS,
        currency_code: "USD",
        description: `${LEAD_TOPUP_LEADS.toLocaleString()} Lead Top-Up`,
      })
      .request();
    invoiceId = (result as unknown as { invoice: { id: string } }).invoice.id;
  } catch (err: unknown) {
    const msg = err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null
        ? JSON.stringify(err)
        : String(err);
    console.error("[purchaseLeadTopUp] charge failed:", msg);
    return { ok: false, error: msg };
  }

  const { data, error } = await supabase.rpc("grant_leads_topup", {
    p_workspace_id: profile.workspace_id,
    p_leads: LEAD_TOPUP_LEADS,
    p_price_cents: LEAD_TOPUP_PRICE_CENTS,
    p_chargebee_invoice_id: invoiceId,
  });

  if (error) {
    // Charge succeeded but the grant failed to record — surface this loudly,
    // don't silently eat a paid-for-but-ungranted top-up.
    console.error("[purchaseLeadTopUp] charge succeeded but grant failed:", error.message, { invoiceId });
    return { ok: false, error: "Payment succeeded but we couldn't add your leads — contact support with invoice " + invoiceId };
  }

  const result = data as { ok: boolean; topup_leads_remaining?: number };
  return { ok: true, leadsGranted: LEAD_TOPUP_LEADS, topupLeadsRemaining: result.topup_leads_remaining };
}

export interface LeadTopUpHistoryEntry {
  id: string;
  quantity: number;
  price_cents: number;
  chargebee_invoice_id: string | null;
  created_at: string;
}

/** For the dashboard's "purchased top-up leads" history. */
export async function getLeadTopUpHistory(limit = 20): Promise<LeadTopUpHistoryEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_top_ups")
    .select("id, quantity, price_cents, chargebee_invoice_id, created_at")
    .eq("resource_type", "leads")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
