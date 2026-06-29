/**
 * POST /api/billing/webhook
 * Receives Chargebee webhook events and keeps our subscriptions table in sync.
 *
 * Security: Chargebee uses HTTP Basic Auth on webhooks.
 * In the Chargebee dashboard → Settings → Webhooks, set:
 *   Username: webhook
 *   Password: <CHARGEBEE_WEBHOOK_PASSWORD env var>
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  syncSubscriptionFromChargebee,
  resetCycleCredits,
  workspaceByChargebeeCustomer,
  type PlanId,
  type BillingInterval,
  type SubscriptionStatus,
} from "@/lib/queries/subscriptions";
import { PRICE_ID_TO_PLAN, PLAN_CREDITS } from "@/lib/chargebee";

// Verify the Basic Auth header Chargebee sends with every webhook
function verifyBasicAuth(req: NextRequest): boolean {
  const password = process.env.CHARGEBEE_WEBHOOK_PASSWORD;
  if (!password) return true; // skip check in dev if not set

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Basic ")) return false;

  const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
  // Expected format: "webhook:<password>"
  return decoded === `webhook:${password}`;
}

// Map Chargebee subscription status → our status
function mapStatus(cbStatus: string): SubscriptionStatus {
  switch (cbStatus) {
    case "in_trial":   return "trialing";
    case "active":     return "active";
    case "future":     return "active";
    case "paused":     return "past_due";
    case "non_renewing": return "active"; // still active until period end
    case "cancelled":  return "canceled";
    default:           return "active";
  }
}

// Extract our planId + billingInterval from the Chargebee subscription object
function resolvePlan(cbSub: Record<string, unknown>): {
  planId: PlanId;
  billingInterval: BillingInterval;
  chargebeePlanId: string;
} {
  // Chargebee Product Catalog v2 uses subscription_items
  const items = cbSub.subscription_items as Array<{ item_price_id: string }> | undefined;
  const priceId = items?.[0]?.item_price_id ?? (cbSub.plan_id as string) ?? "";

  const mapped = PRICE_ID_TO_PLAN[priceId];
  if (mapped) {
    return {
      planId:          mapped.planId as PlanId,
      billingInterval: mapped.interval as BillingInterval,
      chargebeePlanId: priceId,
    };
  }

  // Fallback: parse by convention "{planId}-{interval}-USD"
  const parts = priceId.toLowerCase().split("-");
  const planId = (["basic", "starter", "pro"].find(p => parts.includes(p)) ?? "basic") as PlanId;
  const billingInterval: BillingInterval = parts.includes("annual") ? "annual" : "monthly";
  return { planId, billingInterval, chargebeePlanId: priceId };
}

export async function POST(req: NextRequest) {
  if (!verifyBasicAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = body.event_type as string;
  const content   = body.content as Record<string, unknown>;

  console.log("[billing/webhook]", eventType);

  try {
    switch (eventType) {
      case "subscription_created":
      case "subscription_activated":
      case "subscription_changed":
      case "subscription_reactivated": {
        await handleSubscriptionUpsert(content);
        break;
      }
      case "subscription_renewed": {
        await handleRenewal(content);
        break;
      }
      case "subscription_cancelled":
      case "subscription_deleted": {
        await handleCancellation(content);
        break;
      }
      case "payment_failed": {
        await handlePaymentFailed(content);
        break;
      }
      case "payment_succeeded": {
        // Payment recovered — already handled by subscription_reactivated in most cases
        break;
      }
      default:
        // Unknown event — acknowledge without processing
        break;
    }
  } catch (err) {
    console.error("[billing/webhook] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleSubscriptionUpsert(content: Record<string, unknown>) {
  const cbSub      = content.subscription as Record<string, unknown>;
  const cbCustomer = content.customer    as Record<string, unknown> | undefined;

  const customerId = String(cbSub.customer_id ?? cbCustomer?.id ?? "");
  const workspaceId = await resolveWorkspace(cbSub, customerId);
  if (!workspaceId) return;

  const { planId, billingInterval, chargebeePlanId } = resolvePlan(cbSub);

  await syncSubscriptionFromChargebee({
    workspaceId,
    planId,
    billingInterval,
    status:                 mapStatus(String(cbSub.status ?? "active")),
    creditsTotal:           PLAN_CREDITS[planId] ?? 150,
    currentPeriodStart:     new Date((cbSub.current_term_start as number) * 1000),
    currentPeriodEnd:       new Date((cbSub.current_term_end   as number) * 1000),
    trialEndsAt:            cbSub.trial_end ? new Date((cbSub.trial_end as number) * 1000) : null,
    chargebeeCustomerId:    customerId,
    chargebeeSubscriptionId: String(cbSub.id),
    chargebeePlanId,
  });
}

async function handleRenewal(content: Record<string, unknown>) {
  const cbSub      = content.subscription as Record<string, unknown>;
  const customerId = String(cbSub.customer_id ?? "");
  const workspaceId = await resolveWorkspace(cbSub, customerId);
  if (!workspaceId) return;

  // Reset credits for the new cycle
  await resetCycleCredits(workspaceId);

  // Also sync any plan/period changes that came with the renewal
  await handleSubscriptionUpsert(content);
}

async function handleCancellation(content: Record<string, unknown>) {
  const cbSub      = content.subscription as Record<string, unknown>;
  const customerId = String(cbSub.customer_id ?? "");
  const workspaceId = await resolveWorkspace(cbSub, customerId);
  if (!workspaceId) return;

  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId);
}

async function handlePaymentFailed(content: Record<string, unknown>) {
  const cbSub      = content.subscription as Record<string, unknown>;
  const customerId = String(cbSub.customer_id ?? "");
  const workspaceId = await resolveWorkspace(cbSub, customerId);
  if (!workspaceId) return;

  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({ status: "past_due", updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId);
}

// ── Workspace resolution ──────────────────────────────────────────────────────

async function resolveWorkspace(
  cbSub: Record<string, unknown>,
  customerId: string
): Promise<string | null> {
  // 1. Check metadata.workspace_id (set at checkout creation)
  const meta = cbSub.meta_data as Record<string, string> | undefined;
  if (meta?.workspace_id) return meta.workspace_id;

  // 2. The customer ID is set to workspace_id at checkout (new subscriptions)
  if (customerId && customerId.length === 36) return customerId;

  // 3. Look up by stored chargebee_customer_id
  if (customerId) return workspaceByChargebeeCustomer(customerId);

  return null;
}
