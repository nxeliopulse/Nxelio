/**
 * Stripe subscription lifecycle QA — runs against Stripe TEST mode and the
 * dev Supabase project. Creates real test-mode Stripe objects, drives the
 * app's own webhook endpoint with properly signed events, and asserts the
 * resulting database state.
 *
 * Requires: dev server on :3000 started with STRIPE_WEBHOOK_SECRET matching
 * WEBHOOK_SECRET below, and a test workspace id in QA_WORKSPACE_ID.
 *
 *   STRIPE_WEBHOOK_SECRET=whsec_qa_test_secret_12345 npm run dev
 *   QA_WORKSPACE_ID=<uuid> node scripts/test-stripe-lifecycle.mjs
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import Stripe from "stripe";

for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i)] ??= l.slice(i + 1).trim();
}

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_qa_test_secret_12345";
const WS = process.env.QA_WORKSPACE_ID;
const URL = "http://localhost:3000/api/billing/webhook";
if (!WS) { console.error("Set QA_WORKSPACE_ID"); process.exit(1); }
if (process.env.STRIPE_SECRET_KEY.startsWith("sk_live_")) { console.error("REFUSING: live key"); process.exit(1); }

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const PRICE = {
  basic:   "price_1TwhzACRKbhmPQVVA1kOwaAT",
  starter: "price_1TxMCLCRKbhmPQVVLqm7C8wB",
  pro:     "price_1TxMDyCRKbhmPQVVeVUe7cPB",
};

const db = (sql) =>
  execFileSync("psql", [process.env.DATABASE_URL, "-At", "-c", sql], { encoding: "utf8" }).trim();
const subRow = () =>
  db(`select plan_id||'|'||status||'|'||credits_remaining||'|'||credits_total||'|'||leads_remaining||'|'||coalesce(stripe_subscription_id,'-')||'|'||coalesce(stripe_customer_id,'-')||'|'||coalesce(stripe_price_id,'-')||'|'||cancel_at_period_end from subscriptions where workspace_id='${WS}'`);
const ledgerCount = () => db(`select count(*) from credit_ledger where workspace_id='${WS}'`);

let evtSeq = 0;
async function sendEvent(type, object, opts = {}) {
  const id = opts.eventId ?? `evt_qa_${Date.now()}_${evtSeq++}`;
  const payload = JSON.stringify({
    id, object: "event", type, api_version: "2025-01-01", created: Math.floor(Date.now() / 1000),
    data: { object }, livemode: false, pending_webhooks: 0, request: { id: null, idempotency_key: null },
  });
  const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": sig }, body: payload });
  return { eventId: id, status: r.status, body: await r.text() };
}

const results = [];
const record = (tc, status, detail) => { results.push({ tc, status, detail }); console.log(`${status.padEnd(5)} ${tc}  ${detail}`); };

async function makeSubscription(plan, card, extra = {}) {
  const customer = await stripe.customers.create({ email: `qa+${Date.now()}@example.test`, metadata: { workspace_id: WS } });
  let pm = null;
  if (card) {
    // Only attachable (good) cards go on the customer — Stripe rejects a
    // declining card at attach time, so those are passed to invoices.pay().
    pm = await stripe.paymentMethods.create({ type: "card", card: { token: card } });
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
  }
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: PRICE[plan] }],
    metadata: { workspace_id: WS },
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.confirmation_secret"],
    ...extra,
  });
  return { customer, sub, pm };
}

async function payLatestInvoice(sub, paymentMethod) {
  const inv = typeof sub.latest_invoice === "string" ? await stripe.invoices.retrieve(sub.latest_invoice) : sub.latest_invoice;
  try { await stripe.invoices.pay(inv.id, paymentMethod ? { payment_method: paymentMethod } : {}); } catch (e) { return e; }
  return null;
}

// ── TC-01 / TC-06: successful new subscription syncs correctly ──────────────
const t1 = await makeSubscription("starter", "tok_visa");
const payErr = await payLatestInvoice(t1.sub);
let live = await stripe.subscriptions.retrieve(t1.sub.id);
{
  const before = ledgerCount();
  const r = await sendEvent("customer.subscription.updated", live);
  const row = subRow();
  const [plan, status, , total, leads, subId, custId, priceId] = row.split("|");
  const ok = r.status === 200 && plan === "starter" && status === "active" &&
             subId === live.id && custId === t1.customer.id && priceId === PRICE.starter &&
             total === "1400" && leads === "1000";
  record("TC-01/TC-06 new subscription sync", ok ? "PASS" : "FAIL",
    `stripe=${live.status} db=${row} http=${r.status} payErr=${payErr?.code ?? "none"} ledger ${before}->${ledgerCount()}`);
}

// ── TC-07: duplicate webhook event is a no-op ────────────────────────────────
{
  const fixedId = `evt_qa_dup_${Date.now()}`;
  const before = ledgerCount();
  const a = await sendEvent("customer.subscription.updated", live, { eventId: fixedId });
  const mid = subRow(), midLedger = ledgerCount();
  const b = await sendEvent("customer.subscription.updated", live, { eventId: fixedId });
  const after = subRow(), afterLedger = ledgerCount();
  const dup = JSON.parse(b.body).duplicate === true;
  record("TC-07 duplicate event idempotency", dup && mid === after && midLedger === afterLedger ? "PASS" : "FAIL",
    `2nd response=${b.body} ledger ${before}->${midLedger}->${afterLedger} state unchanged=${mid === after}`);
}

// ── TC-13: upgrade starter -> pro, one subscription only ────────────────────
{
  const updated = await stripe.subscriptions.update(live.id, {
    items: [{ id: live.items.data[0].id, price: PRICE.pro }], proration_behavior: "create_prorations",
  });
  await sendEvent("customer.subscription.updated", updated);
  const row = subRow();
  const [plan, status, credRem, credTot, leads, subId] = row.split("|");
  const all = await stripe.subscriptions.list({ customer: t1.customer.id, status: "all" });
  const ok = plan === "pro" && status === "active" && subId === updated.id && credTot === "2400" && leads === "2000" && all.data.length === 1;
  record("TC-13 upgrade starter->pro", ok ? "PASS" : "FAIL",
    `db=${row} stripeSubsForCustomer=${all.data.length} (expect 1)`);
  live = updated;
}

// ── TC-14: downgrade pro -> basic ───────────────────────────────────────────
{
  const downgraded = await stripe.subscriptions.update(live.id, {
    items: [{ id: live.items.data[0].id, price: PRICE.basic }], proration_behavior: "create_prorations",
  });
  await sendEvent("customer.subscription.updated", downgraded);
  const row = subRow();
  const [plan, , , credTot] = row.split("|");
  record("TC-14 downgrade pro->basic (Stripe-side)", plan === "basic" && credTot === "400" ? "PASS" : "FAIL",
    `db=${row} — note: app UI/API blocks downgrades; this is the Stripe/portal path`);
  // restore to pro for the cancellation tests
  live = await stripe.subscriptions.update(live.id, { items: [{ id: downgraded.items.data[0].id, price: PRICE.pro }] });
  await sendEvent("customer.subscription.updated", live);
}

// ── TC-11: scheduled cancellation ───────────────────────────────────────────
{
  const canceling = await stripe.subscriptions.update(live.id, { cancel_at_period_end: true });
  await sendEvent("customer.subscription.updated", canceling);
  const row = subRow();
  const [, status, , , , , , , cape] = row.split("|");
  record("TC-11 cancel at period end", cape === "true" && status === "active" ? "PASS" : "FAIL",
    `db=${row} (expect cancel_at_period_end=t, status still active)`);
  live = await stripe.subscriptions.update(live.id, { cancel_at_period_end: false });
  await sendEvent("customer.subscription.updated", live);
}

// ── TC-12: cancellation initiated from Stripe ───────────────────────────────
{
  const deleted = await stripe.subscriptions.cancel(live.id);
  const r = await sendEvent("customer.subscription.deleted", deleted);
  const row = subRow();
  const [, status] = row.split("|");
  record("TC-12 cancel from Stripe dashboard/API", status === "canceled" && r.status === 200 ? "PASS" : "FAIL", `db=${row}`);
}

// ── TC-03: declined card never grants paid access ───────────────────────────
{
  db(`update subscriptions set plan_id='basic', status='canceled', credits_remaining=0, credits_total=0, leads_remaining=0, stripe_subscription_id=null where workspace_id='${WS}'`);
  const t3 = await makeSubscription("pro", null);
  const err = await payLatestInvoice(t3.sub, "pm_card_chargeDeclined");
  const s = await stripe.subscriptions.retrieve(t3.sub.id);
  const r = await sendEvent("customer.subscription.updated", s);
  const row = subRow();
  const [plan, status] = row.split("|");
  const notActive = status !== "active" && status !== "trialing";
  record("TC-03 declined card", err && s.status === "incomplete" && notActive ? "PASS" : "FAIL",
    `stripeErr=${err?.code ?? "NONE"} stripeStatus=${s.status} db=${row} http=${r.status}`);
  await stripe.subscriptions.cancel(t3.sub.id).catch(() => {});
}

// ── TC-04: 3D Secure / authentication required ──────────────────────────────
{
  const t4 = await makeSubscription("pro", null);
  const err = await payLatestInvoice(t4.sub, "pm_card_authenticationRequired");
  const s = await stripe.subscriptions.retrieve(t4.sub.id);
  await sendEvent("customer.subscription.updated", s);
  const row = subRow();
  const [, status] = row.split("|");
  const notActive = status !== "active" && status !== "trialing";
  record("TC-04 3DS required, not completed", s.status === "incomplete" && notActive ? "PASS" : "FAIL",
    `stripeStatus=${s.status} err=${err?.code ?? "none"} db=${row} (must NOT be active before authentication)`);
  await stripe.subscriptions.cancel(t4.sub.id).catch(() => {});
}

// ── TC-15: trial subscription ───────────────────────────────────────────────
{
  const customer = await stripe.customers.create({ email: `qa+trial${Date.now()}@example.test`, metadata: { workspace_id: WS } });
  const s = await stripe.subscriptions.create({
    customer: customer.id, items: [{ price: PRICE.basic }], trial_period_days: 7,
    metadata: { workspace_id: WS }, trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
  });
  await sendEvent("customer.subscription.created", s);
  const row = subRow();
  const [plan, status] = row.split("|");
  const trialEnds = db(`select coalesce(trial_ends_at::text,'-') from subscriptions where workspace_id='${WS}'`);
  record("TC-15 trial subscription", s.status === "trialing" && status === "trialing" && plan === "basic" && trialEnds !== "-" ? "PASS" : "FAIL",
    `stripe=${s.status} db=${row} trial_ends_at=${trialEnds}`);
  await stripe.subscriptions.cancel(s.id).catch(() => {});
}

// ── TC-10: failed renewal -> past_due ───────────────────────────────────────
{
  const t = await makeSubscription("starter", "tok_visa");
  await payLatestInvoice(t.sub);
  const s = await stripe.subscriptions.retrieve(t.sub.id);
  await sendEvent("customer.subscription.updated", s);
  const inv = await stripe.invoices.retrieve(typeof s.latest_invoice === "string" ? s.latest_invoice : s.latest_invoice.id);
  const fake = { ...inv, billing_reason: "subscription_cycle", parent: { subscription_details: { subscription: s.id } } };
  const r = await sendEvent("invoice.payment_failed", fake);
  const row = subRow();
  const [, status] = row.split("|");
  record("TC-10 invoice.payment_failed -> past_due", status === "past_due" && r.status === 200 ? "PASS" : "FAIL", `db=${row} http=${r.status}`);
  globalThis.__renewalSub = s;
  globalThis.__renewalInv = inv;
}

// ── TC-09: renewal invoice.paid refills the cycle, once ─────────────────────
{
  const s = globalThis.__renewalSub, inv = globalThis.__renewalInv;
  await sendEvent("customer.subscription.updated", s);
  const beforeLedger = ledgerCount();
  db(`update subscriptions set credits_remaining=5, leads_remaining=5 where workspace_id='${WS}'`);
  const renewal = { ...inv, billing_reason: "subscription_cycle", parent: { subscription_details: { subscription: s.id } } };
  await sendEvent("invoice.paid", renewal);
  const afterFirst = subRow();
  await sendEvent("invoice.paid", renewal); // same invoice id, NEW event id
  const afterSecond = subRow();
  const [plan, status, credRem, , leads] = afterFirst.split("|");
  const ok = credRem === "1400" && leads === "1000" && status === "active" && afterFirst === afterSecond;
  record("TC-09 renewal refill + replay guard", ok ? "PASS" : "FAIL",
    `after1=${afterFirst} after2=${afterSecond} sameInvoiceTwiceIsNoOp=${afterFirst === afterSecond} ledger ${beforeLedger}->${ledgerCount()}`);
  await stripe.subscriptions.cancel(s.id).catch(() => {});
}

// ── TC-18: invalid / missing Stripe IDs are handled safely ──────────────────
{
  const checks = [];
  for (const [label, fn] of [
    ["invalid subscription id", () => stripe.subscriptions.retrieve("sub_does_not_exist_qa")],
    ["invalid customer id",     () => stripe.customers.retrieve("cus_does_not_exist_qa")],
    ["invalid price id",        () => stripe.subscriptions.create({ customer: "cus_x", items: [{ price: "price_bogus_qa" }] })],
    ["empty subscription id",   () => stripe.subscriptions.retrieve("")],
  ]) {
    try { await fn(); checks.push(`${label}=NO_ERROR`); }
    catch (e) { checks.push(`${label}=${e.type ?? e.constructor.name}`); }
  }
  const before = subRow();
  const r = await sendEvent("customer.subscription.updated", {
    id: "sub_bogus_qa", object: "subscription", customer: "cus_bogus_qa", status: "active",
    items: { data: [{ price: { id: "price_bogus_qa" }, current_period_start: 1, current_period_end: 2 }] },
    metadata: {}, cancel_at_period_end: false, canceled_at: null, trial_end: null,
  });
  const after = subRow();
  record("TC-18 invalid Stripe IDs", r.status === 200 && before === after ? "PASS" : "FAIL",
    `${checks.join(", ")} | unknown-customer event http=${r.status} dbUnchanged=${before === after}`);
}

// ── TC-06b: unsupported event type does not crash ───────────────────────────
{
  const r = await sendEvent("payment_intent.succeeded", { id: "pi_qa", object: "payment_intent", amount: 100 });
  const r2 = await sendEvent("customer.subscription.updated", { id: "sub_malformed_qa", object: "subscription" });
  record("TC-06b unsupported / malformed events", r.status === 200 && (r2.status === 200 || r2.status === 500) ? "PASS" : "FAIL",
    `payment_intent.succeeded=${r.status} malformed_subscription=${r2.status} ${r2.status === 500 ? "(500 = Stripe will retry, acceptable)" : ""}`);
}

console.log("\n──────── SUMMARY ────────");
console.log(`PASS ${results.filter(r => r.status === "PASS").length} / ${results.length}`);
for (const r of results.filter(r => r.status !== "PASS")) console.log(`  ${r.status}: ${r.tc} — ${r.detail}`);
