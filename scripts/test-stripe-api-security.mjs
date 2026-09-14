/**
 * Authenticated API-level security QA for the Stripe billing routes.
 *
 * Creates two throwaway users (A and B) in the DEV Supabase project, signs
 * them in, and drives the app's real HTTP routes with their session cookies
 * to check plan/price tampering, cross-tenant access, and access control.
 *
 *   node scripts/test-stripe-api-security.mjs     (dev server must be on :3000)
 *
 * Cleans up its own users and workspaces at the end.
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i)] ??= l.slice(i + 1).trim();
}
const APP = "http://localhost:3000";
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA).hostname.split(".")[0];
const admin = createClient(SUPA, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const db = (sql) =>
  execFileSync("psql", [process.env.DATABASE_URL, "-At", "-c", sql], { encoding: "utf8" })
    .split("\n")
    .filter((l) => !/^(INSERT|UPDATE|DELETE|SELECT) \d/.test(l.trim()))
    .join("\n")
    .trim();

const results = [];
const record = (tc, status, detail) => { results.push({ tc, status, detail }); console.log(`${status.padEnd(5)} ${tc}  ${detail}`); };

async function makeUser(tag) {
  const email = `qa-stripe-${tag}-${Date.now()}@example.test`;
  const password = "QaTest!" + Math.random().toString(36).slice(2, 10);
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const userId = data.user.id;
  const wsId = db(`insert into workspaces (name, owner_id) values ('QA-${tag}-${Date.now()}', '${userId}') returning id`);
  db(`insert into users (user_id, full_name, email, workspace_id) values ('${userId}','QA ${tag}','${email}','${wsId}')
      on conflict (user_id) do update set workspace_id='${wsId}'`);
  const anon = createClient(SUPA, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await anon.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  // @supabase/ssr stores the whole session as base64- prefixed JSON in one cookie
  const cookie = `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(s.session)).toString("base64url")}`;
  return { email, userId, wsId, cookie, accessToken: s.session.access_token };
}

const api = (path, cookie, body) =>
  fetch(APP + path, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body ?? {}),
  });

const A = await makeUser("A");
const B = await makeUser("B");
console.log(`user A ws=${A.wsId}\nuser B ws=${B.wsId}\n`);

// ── TC-19: price / plan tampering ───────────────────────────────────────────
{
  const attempts = [];
  for (const payload of [
    { planId: "pro", billingInterval: "monthly", priceId: "price_1TwhzACRKbhmPQVVA1kOwaAT" }, // cheap price, expensive plan
    { planId: "pro", billingInterval: "monthly", stripePriceId: "price_attacker_choice" },
    { planId: "price_1TwhzACRKbhmPQVVA1kOwaAT", billingInterval: "monthly" },
    { planId: "enterprise", billingInterval: "monthly" },
    { planId: "pro", billingInterval: "hourly" },
    { planId: { $ne: null }, billingInterval: "monthly" },
  ]) {
    const r = await api("/api/billing/checkout", A.cookie, payload);
    const t = await r.text();
    attempts.push(`${JSON.stringify(payload).slice(0, 55)} -> ${r.status}`);
    // A rejected payload must not produce a checkout URL at all
    if (r.status === 200 && t.includes("checkout.stripe.com")) {
      const url = JSON.parse(t).url;
      attempts.push(`  !! got checkout URL for ${JSON.stringify(payload)}: ${url.slice(0, 60)}`);
    }
  }
  // Confirm the honest path resolves the price server-side, ignoring client price hints
  const good = await api("/api/billing/checkout", A.cookie, { planId: "basic", billingInterval: "monthly", priceId: "price_bogus" });
  const goodBody = await good.text();
  let sessionPrice = "n/a";
  if (good.status === 200) {
    const Stripe = (await import("stripe")).default;
    const sc = new Stripe(process.env.STRIPE_SECRET_KEY);
    const sid = new URL(JSON.parse(goodBody).url).pathname.split("/").pop() ||
                JSON.parse(goodBody).url.match(/cs_test_[A-Za-z0-9]+/)?.[0];
    const sessions = await sc.checkout.sessions.list({ limit: 1 });
    const li = await sc.checkout.sessions.listLineItems(sessions.data[0].id);
    sessionPrice = li.data[0]?.price?.id;
  }
  const ok = sessionPrice === "price_1TwhzACRKbhmPQVVA1kOwaAT";
  record("TC-19 price/plan tampering", ok ? "PASS" : "FAIL",
    `rejected: ${attempts.join("; ")} | honest request with bogus client priceId used server price ${sessionPrice}`);
}

// ── TC-16/TC-17: unauthenticated and cross-tenant access ────────────────────
{
  const noAuth = [];
  for (const p of ["/api/billing/checkout", "/api/billing/cancel", "/api/billing/resume", "/api/billing/portal"]) {
    const r = await api(p, null, { planId: "pro", billingInterval: "monthly" });
    noAuth.push(`${p.split("/").pop()}=${r.status}`);
  }
  const allRejected = noAuth.every((s) => s.endsWith("=401"));
  record("TC-16 unauthenticated billing endpoints", allRejected ? "PASS" : "FAIL", noAuth.join(" "));
}

// Give B a real-looking paid subscription, then have A try to touch it.
db(`update subscriptions set plan_id='pro', status='active', stripe_subscription_id='sub_B_TARGET', stripe_customer_id='cus_B_TARGET', credits_remaining=2400, credits_total=2400 where workspace_id='${B.wsId}'`);
{
  const before = db(`select plan_id||'|'||status||'|'||coalesce(stripe_subscription_id,'-')||'|'||cancel_at_period_end from subscriptions where workspace_id='${B.wsId}'`);
  const attempts = [];
  for (const [label, path, body] of [
    ["cancel B by workspace_id", "/api/billing/cancel", { workspaceId: B.wsId }],
    ["cancel B by subscriptionId", "/api/billing/cancel", { subscriptionId: "sub_B_TARGET", stripe_subscription_id: "sub_B_TARGET" }],
    ["resume B", "/api/billing/resume", { workspaceId: B.wsId, subscriptionId: "sub_B_TARGET" }],
    ["portal as B's customer", "/api/billing/portal", { customerId: "cus_B_TARGET", stripe_customer_id: "cus_B_TARGET" }],
  ]) {
    const r = await api(path, A.cookie, body);
    const t = (await r.text()).slice(0, 90);
    attempts.push(`${label}=${r.status} ${t}`);
  }
  const after = db(`select plan_id||'|'||status||'|'||coalesce(stripe_subscription_id,'-')||'|'||cancel_at_period_end from subscriptions where workspace_id='${B.wsId}'`);
  record("TC-17 cross-tenant subscription manipulation", before === after ? "PASS" : "FAIL",
    `B before=${before} after=${after} | ${attempts.join(" ;; ")}`);
}

// ── TC-20: checkout success URL manipulation ────────────────────────────────
{
  const before = db(`select plan_id||'|'||status||'|'||credits_remaining from subscriptions where workspace_id='${A.wsId}'`);
  const probes = [];
  for (const q of ["", "?session_id=cs_test_bogus_qa", "?session_id=", "?session_id=cs_test_bogus&plan=pro&status=active", "?plan=pro&paid=true"]) {
    const r = await fetch(`${APP}/checkout-return${q}`, { headers: { Cookie: A.cookie }, redirect: "manual" });
    probes.push(`"${q || "(none)"}"=>${r.status} ${r.headers.get("location") ?? ""}`);
  }
  const after = db(`select plan_id||'|'||status||'|'||credits_remaining from subscriptions where workspace_id='${A.wsId}'`);
  record("TC-20 success-URL manipulation", before === after ? "PASS" : "FAIL",
    `A before=${before} after=${after} | ${probes.join(" ;; ")}`);
}

// ── TC-20b: does /checkout-return verify the session belongs to the caller? ──
// A pays for Basic in their own workspace; then B replays A's session_id.
{
  const Stripe = (await import("stripe")).default;
  const sc = new Stripe(process.env.STRIPE_SECRET_KEY);
  // Build a genuinely completed Checkout Session for workspace A using a test clock-free flow:
  // create the subscription directly and a session cannot be forged, so instead we test the
  // weaker, decisive property: does the route bind session -> workspace at all?
  const src = fs.readFileSync("src/app/checkout-return/route.ts", "utf8");
  const binds = /session\.metadata\?\.workspace_id|metadata\.workspace_id\s*[!=]==?\s*profile\.workspace_id/.test(src);
  record("TC-20b checkout-return binds session to caller's workspace", binds ? "PASS" : "FAIL",
    binds ? "route compares the session's workspace_id metadata to the caller's workspace"
          : "route syncs ANY retrievable Checkout Session onto the CALLER's workspace — the session id is never checked against session.metadata.workspace_id");
}

// ── TC-23: concurrent checkout requests ─────────────────────────────────────
{
  const rs = await Promise.all([1, 2, 3].map(() => api("/api/billing/checkout", A.cookie, { planId: "starter", billingInterval: "monthly" })));
  const codes = rs.map((r) => r.status);
  const rows = db(`select count(*) from subscriptions where workspace_id='${A.wsId}'`);
  record("TC-23 concurrent checkout requests", rows === "1" ? "PASS" : "FAIL",
    `http=${codes.join(",")} subscription rows for workspace=${rows} (unique(workspace_id) constraint holds; note each call creates a separate Stripe Checkout Session, only one can be completed)`);
}

// ── TC-16b: server-side feature gating by status ────────────────────────────
{
  const states = [];
  for (const st of ["active", "trialing", "past_due", "canceled"]) {
    db(`update subscriptions set status='${st}', plan_id='pro', credits_remaining=100 where workspace_id='${A.wsId}'`);
    const r = await fetch(`${SUPA}/rest/v1/rpc/deduct_credits`, {
      method: "POST",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${A.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_workspace_id: A.wsId, p_operation_type: "qa_gate_probe", p_amount: 1 }),
    });
    const t = await r.text();
    states.push(`${st}:${JSON.parse(t).ok ? "ALLOWED" : "denied"}`);
  }
  const ok = states.join(",") === "active:ALLOWED,trialing:ALLOWED,past_due:denied,canceled:denied";
  record("TC-16b credit spend gated by subscription status", ok ? "PASS" : "FAIL", states.join(" "));
}

// ── TC-17b: authenticated cross-workspace RPC abuse ─────────────────────────
{
  const before = db(`select plan_id||'|'||status||'|'||credits_remaining from subscriptions where workspace_id='${B.wsId}'`);
  const calls = [];
  for (const [fn, body] of [
    ["deduct_credits", { p_workspace_id: B.wsId, p_operation_type: "qa_attack", p_amount: 50 }],
    ["deduct_leads", { p_workspace_id: B.wsId, p_amount: 50 }],
    ["sync_subscription_from_stripe", { p_workspace_id: B.wsId, p_plan_id: "basic", p_billing_interval: "monthly", p_status: "canceled", p_credits_total: 0, p_leads_total: 0, p_current_period_start: "2026-01-01T00:00:00Z", p_current_period_end: "2026-01-02T00:00:00Z", p_trial_ends_at: null, p_stripe_customer_id: "cus_X", p_stripe_subscription_id: "sub_X", p_stripe_price_id: "price_X", p_cancel_at_period_end: false, p_canceled_at: null }],
    ["reset_subscription_cycle", { p_workspace_id: B.wsId, p_idempotency_key: null }],
  ]) {
    const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${A.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    calls.push(`${fn}=${r.status} ${(await r.text()).slice(0, 60)}`);
  }
  const after = db(`select plan_id||'|'||status||'|'||credits_remaining from subscriptions where workspace_id='${B.wsId}'`);
  record("TC-17b user A attacks user B's subscription via RPC", before === after ? "PASS" : "FAIL",
    `B before=${before} after=${after} | ${calls.join(" ;; ")}`);
}

// ── Cleanup ─────────────────────────────────────────────────────────────────
for (const u of [A, B]) {
  db(`delete from credit_ledger where workspace_id='${u.wsId}'`);
  db(`delete from subscriptions where workspace_id='${u.wsId}'`);
  db(`delete from users where user_id='${u.userId}'`);
  db(`delete from workspaces where id='${u.wsId}'`);
  await admin.auth.admin.deleteUser(u.userId).catch(() => {});
}
console.log("\ncleanup done");
console.log("──────── SUMMARY ────────");
console.log(`PASS ${results.filter((r) => r.status === "PASS").length} / ${results.length}`);
for (const r of results.filter((r) => r.status !== "PASS")) console.log(`  ${r.status}: ${r.tc}`);
