import test from "node:test";
import assert from "node:assert/strict";
import { isPublicPath, isIdleExpired, PUBLIC_PATH_PREFIXES } from "../src/lib/idle-timeout-rules.ts";
import { getIdleTimeoutMinutes, getWarningLeadMinutes } from "../src/lib/idle-timeout-config.ts";

test("isPublicPath: root and known public prefixes are excluded from idle tracking", () => {
  assert.equal(isPublicPath("/"), true);
  assert.equal(isPublicPath("/login"), true);
  assert.equal(isPublicPath("/login/"), true);
  assert.equal(isPublicPath("/signup"), true);
  assert.equal(isPublicPath("/admin"), true);
  assert.equal(isPublicPath("/admin/feature-access"), true);
  assert.equal(isPublicPath("/api/outreach/cron"), true);
  assert.equal(isPublicPath("/capture/some-slug"), true);
  assert.equal(isPublicPath("/book/some-workspace"), true);
});

test("isPublicPath: real authenticated app pages are NOT excluded", () => {
  assert.equal(isPublicPath("/dashboard"), false);
  assert.equal(isPublicPath("/leads"), false);
  assert.equal(isPublicPath("/accounts/123"), false);
  assert.equal(isPublicPath("/contacts/456"), false);
  assert.equal(isPublicPath("/opportunities"), false);
  // Confirms sections added after the older isAppPage allowlist in proxy.ts
  // are still covered by the (separate, broader) idle-timeout exclusion.
  assert.equal(isPublicPath("/meetings"), false);
  assert.equal(isPublicPath("/playbooks"), false);
});

test("isPublicPath: prefix matching doesn't false-positive on similar-looking paths", () => {
  // "/admin" must not swallow "/adminx" just because it starts with the same letters.
  assert.equal(isPublicPath("/adminx"), false);
  assert.equal(isPublicPath("/bookmark"), false);
  // "/capture-form" is the authenticated capture-form SETTINGS page, distinct
  // from the public "/capture" prefix (form builder + public capture pages) —
  // it must stay protected, not be swept in as public.
  assert.equal(isPublicPath("/capture-form"), false);
});

test("PUBLIC_PATH_PREFIXES all start with a slash (matcher assumption)", () => {
  for (const p of PUBLIC_PATH_PREFIXES) {
    assert.ok(p.startsWith("/"), `${p} should start with /`);
  }
});

test("isIdleExpired: a fresh session (no cookie yet) is never expired", () => {
  assert.equal(isIdleExpired(null, Date.now(), 60_000), false);
});

test("isIdleExpired: within the window is not expired, past it is", () => {
  const now = 1_000_000;
  const idleLimitMs = 60_000;
  assert.equal(isIdleExpired(now - 30_000, now, idleLimitMs), false); // 30s ago, 60s limit
  assert.equal(isIdleExpired(now - 60_000, now, idleLimitMs), false); // exactly at the boundary — not yet over
  assert.equal(isIdleExpired(now - 60_001, now, idleLimitMs), true); // one ms past the boundary
});

test("isIdleExpired: guards against a corrupt/non-numeric cookie value", () => {
  assert.equal(isIdleExpired(Number.NaN, Date.now(), 60_000), false);
});

test("getIdleTimeoutMinutes/getWarningLeadMinutes: fall back to defaults when unset or invalid", () => {
  const originalTimeout = process.env.IDLE_TIMEOUT_MINUTES;
  const originalWarning = process.env.IDLE_TIMEOUT_WARNING_MINUTES;
  try {
    delete process.env.IDLE_TIMEOUT_MINUTES;
    delete process.env.IDLE_TIMEOUT_WARNING_MINUTES;
    assert.equal(getIdleTimeoutMinutes(), 30);
    assert.equal(getWarningLeadMinutes(), 2);

    process.env.IDLE_TIMEOUT_MINUTES = "0";
    process.env.IDLE_TIMEOUT_WARNING_MINUTES = "-5";
    assert.equal(getIdleTimeoutMinutes(), 30);
    assert.equal(getWarningLeadMinutes(), 2);

    process.env.IDLE_TIMEOUT_MINUTES = "not-a-number";
    assert.equal(getIdleTimeoutMinutes(), 30);
  } finally {
    if (originalTimeout === undefined) delete process.env.IDLE_TIMEOUT_MINUTES;
    else process.env.IDLE_TIMEOUT_MINUTES = originalTimeout;
    if (originalWarning === undefined) delete process.env.IDLE_TIMEOUT_WARNING_MINUTES;
    else process.env.IDLE_TIMEOUT_WARNING_MINUTES = originalWarning;
  }
});

test("getIdleTimeoutMinutes/getWarningLeadMinutes: respect a valid override", () => {
  const originalTimeout = process.env.IDLE_TIMEOUT_MINUTES;
  const originalWarning = process.env.IDLE_TIMEOUT_WARNING_MINUTES;
  try {
    process.env.IDLE_TIMEOUT_MINUTES = "15";
    process.env.IDLE_TIMEOUT_WARNING_MINUTES = "1";
    assert.equal(getIdleTimeoutMinutes(), 15);
    assert.equal(getWarningLeadMinutes(), 1);
  } finally {
    if (originalTimeout === undefined) delete process.env.IDLE_TIMEOUT_MINUTES;
    else process.env.IDLE_TIMEOUT_MINUTES = originalTimeout;
    if (originalWarning === undefined) delete process.env.IDLE_TIMEOUT_WARNING_MINUTES;
    else process.env.IDLE_TIMEOUT_WARNING_MINUTES = originalWarning;
  }
});
