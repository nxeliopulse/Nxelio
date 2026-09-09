// One-off backfill for the subscription rows that drifted while the Stripe
// webhook endpoint sat `disabled` (see src/lib/billing/reconcile-plan.ts for
// the full story). Reads Stripe, prints the exact before/after for every row
// it would touch, and writes nothing unless you pass --confirm.
//
// It calls the SAME decision function and the SAME database RPCs as
// /api/cron/reset-monthly-credits, so the diff you approve here is exactly
// what the scheduled job will keep doing from now on.
//
// Usage:
//   npm run reconcile:subscriptions              (dry run — prints the diff)
//   npm run reconcile:subscriptions -- --confirm (applies it)
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
// STRIPE_SECRET_KEY from .env.local.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { decideReconcile, snapshotFromStripe } from "../src/lib/billing/reconcile-plan.ts";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const CONFIRM = process.argv.includes("--confirm");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !STRIPE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or STRIPE_SECRET_KEY in .env.local");
  process.exit(1);
}

const SUB_COLUMNS = [
  "workspace_id", "plan_id", "billing_interval", "status",
  "current_period_start", "current_period_end",
  "credits_remaining", "credits_total", "leads_remaining", "leads_total",
  "trial_ends_at", "stripe_customer_id", "stripe_subscription_id",
  "stripe_price_id", "cancel_at_period_end", "canceled_at",
  "last_synced_resource_version",
].join(",");

async function supa(pathAndQuery, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  return { ok: res.ok, status: res.status, body };
}

async function rpc(name, args) {
  return supa(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
}

async function stripeGet(pathAndQuery) {
  const res = await fetch(`https://api.stripe.com/v1/${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${body?.error?.message || "request failed"}`);
  return body;
}

/**
 * Confirms both RPCs exist in THIS database before we rely on them.
 *
 * Worth checking: migrations here have been applied by hand, so a migration
 * file is not proof the function is live. reset_subscription_cycle in
 * particular had never run even once — `credit_ledger` held zero cycle_reset
 * rows — so its presence was entirely unverified.
 *
 * The probe uses an all-zero workspace UUID. Both functions start with
 * `SELECT ... WHERE workspace_id = $1` and return early when nothing matches,
 * so this changes no data.
 */
async function preflight() {
  const NOBODY = "00000000-0000-0000-0000-000000000000";
  const probe = await rpc("reset_subscription_cycle", { p_workspace_id: NOBODY, p_idempotency_key: "preflight" });
  if (probe.status === 404 || probe.body?.code === "PGRST202") {
    console.error("FATAL: reset_subscription_cycle() does not exist in this database.");
    console.error("Apply supabase/migrations/0124_reset_cycle_idempotency.sql first.");
    process.exit(1);
  }
  if (!probe.ok) {
    console.error("FATAL: reset_subscription_cycle() preflight failed:", JSON.stringify(probe.body));
    process.exit(1);
  }
  console.log("preflight: reset_subscription_cycle() present");
}

function fmt(view) {
  if (!view) return "(no write)";
  return [
    `status=${view.status}`,
    `plan=${view.plan_id}`,
    `period=${String(view.current_period_start).slice(0, 10)}→${String(view.current_period_end).slice(0, 10)}`,
    `credits=${view.credits}`,
    `leads=${view.leads}`,
  ].join("  ");
}

async function main() {
  console.log(`\n=== reconcile-subscriptions — ${CONFIRM ? "APPLY" : "DRY RUN"} ===`);
  console.log(`supabase: ${SUPABASE_URL}`);
  console.log(`stripe:   ${STRIPE_KEY.startsWith("sk_live_") ? "LIVE MODE" : "test/sandbox mode"}\n`);

  if (CONFIRM) await preflight();

  const read = await supa(`subscriptions?select=${SUB_COLUMNS}&stripe_subscription_id=not.is.null`);
  if (!read.ok) {
    console.error("Failed to read subscriptions:", JSON.stringify(read.body));
    process.exit(1);
  }
  const rows = read.body;

  // One list call per 100 subscriptions, rather than one retrieve per row.
  // status=all is essential: it is what surfaces subscriptions canceled in
  // Stripe that still read `active` locally.
  const stripeSubs = new Map();
  let startingAfter;
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ status: "all", limit: "100" });
    if (startingAfter) qs.set("starting_after", startingAfter);
    const res = await stripeGet(`subscriptions?${qs}`);
    for (const sub of res.data) stripeSubs.set(sub.id, sub);
    if (!res.has_more || res.data.length === 0) break;
    startingAfter = res.data[res.data.length - 1].id;
  }

  console.log(`scanned ${rows.length} local row(s) against ${stripeSubs.size} Stripe subscription(s)\n`);

  const decisions = rows
    .map((row) => {
      const raw = stripeSubs.get(row.stripe_subscription_id);
      return decideReconcile(row, raw ? snapshotFromStripe(raw) : null);
    })
    .sort((a, b) => a.action.localeCompare(b.action) || a.workspaceId.localeCompare(b.workspaceId));

  const counts = {};
  for (const d of decisions) counts[d.action] = (counts[d.action] || 0) + 1;

  const writable = decisions.filter((d) => d.grantCycle || d.sync || d.patch);

  for (const d of writable) {
    console.log(`── ${d.workspaceId.slice(0, 8)}  [${d.action.toUpperCase()}]  ${d.stripeSubscriptionId}`);
    console.log(`   why:    ${d.reason}`);
    console.log(`   before: ${fmt(d.before)}`);
    console.log(`   after:  ${fmt(d.after)}`);
    if (d.grantCycle) {
      console.log(
        `   ledger: + cycle_reset ${d.grantCycle.creditsTotal} credits` +
          (d.grantCycle.leadsTotal > 0 ? ` and ${d.grantCycle.leadsTotal} leads` : "") +
          `  (idempotency_key=${d.grantCycle.idempotencyKey})`
      );
    } else {
      console.log("   ledger: no entry — credits untouched");
    }
    console.log("");
  }

  const skipped = decisions.filter((d) => d.action === "missing_in_stripe");
  for (const d of skipped) {
    console.log(`── ${d.workspaceId.slice(0, 8)}  [SKIPPED]  ${d.stripeSubscriptionId}: ${d.reason}`);
  }
  if (skipped.length) console.log("");

  console.log("summary:", JSON.stringify(counts));
  console.log(
    `${writable.length} row(s) would be written; ` +
      `${writable.filter((d) => d.grantCycle).length} would receive a credit grant.\n`
  );

  if (!CONFIRM) {
    console.log("DRY RUN — nothing was written. Re-run with --confirm to apply.");
    return;
  }

  let applied = 0;
  const failures = [];
  for (const d of writable) {
    if (d.grantCycle) {
      const res = await rpc("reset_subscription_cycle", {
        p_workspace_id: d.workspaceId,
        p_idempotency_key: d.grantCycle.idempotencyKey,
      });
      if (!res.ok) { failures.push([d.workspaceId, `reset_subscription_cycle: ${JSON.stringify(res.body)}`]); continue; }
    }
    if (d.sync) {
      const res = await rpc("sync_subscription_from_stripe", d.sync);
      if (!res.ok) { failures.push([d.workspaceId, `sync_subscription_from_stripe: ${JSON.stringify(res.body)}`]); continue; }
    }
    if (d.patch) {
      const res = await supa(`subscriptions?workspace_id=eq.${d.workspaceId}`, {
        method: "PATCH",
        body: JSON.stringify(d.patch),
      });
      if (!res.ok) { failures.push([d.workspaceId, `patch: ${JSON.stringify(res.body)}`]); continue; }
    }
    applied++;
    console.log(`applied ${d.workspaceId.slice(0, 8)} (${d.action})`);
  }

  console.log(`\napplied ${applied}/${writable.length} row(s).`);
  if (failures.length) {
    console.log(`${failures.length} failure(s):`);
    for (const [ws, err] of failures) console.log(`  ${ws.slice(0, 8)}: ${err}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
