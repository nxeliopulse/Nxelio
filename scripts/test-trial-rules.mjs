import test from "node:test";
import assert from "node:assert/strict";
import {
  TRIAL_DAYS_MIN,
  TRIAL_DAYS_MAX,
  TRIAL_DAYS_DEFAULT,
  TRIAL_USER_LIMIT,
  TRIAL_USER_LIMIT_MESSAGE,
  validateTrialDays,
  canAddTrialUser,
} from "../src/lib/trial-rules.ts";

// ── The configurable trial period (Admin → Trial Period) ────────────────────

test("the allowed range is 15–30 days, matching the CHECK constraint in 0160", () => {
  assert.equal(TRIAL_DAYS_MIN, 15);
  assert.equal(TRIAL_DAYS_MAX, 30);
});

test("the default sits inside its own range, so a fallback can never be rejected on save", () => {
  assert.ok(TRIAL_DAYS_DEFAULT >= TRIAL_DAYS_MIN);
  assert.ok(TRIAL_DAYS_DEFAULT <= TRIAL_DAYS_MAX);
});

test("the default is the LOW end — a failed settings read must not hand out a free month", () => {
  assert.equal(TRIAL_DAYS_DEFAULT, TRIAL_DAYS_MIN);
});

test("validateTrialDays: every value in the inclusive range is accepted", () => {
  for (let d = TRIAL_DAYS_MIN; d <= TRIAL_DAYS_MAX; d++) {
    const r = validateTrialDays(d);
    assert.equal(r.ok, true, `${d} should be accepted`);
    assert.equal(r.value, d);
  }
});

test("validateTrialDays: both boundaries are inclusive, not exclusive", () => {
  assert.equal(validateTrialDays(15).ok, true);
  assert.equal(validateTrialDays(30).ok, true);
});

test("validateTrialDays: one step outside either boundary is rejected", () => {
  assert.equal(validateTrialDays(14).ok, false);
  assert.equal(validateTrialDays(31).ok, false);
});

test("validateTrialDays: the old hardcoded 7-day trial is no longer a legal value", () => {
  // Guards against someone reinstating the pre-0160 default by hand.
  assert.equal(validateTrialDays(7).ok, false);
});

test("validateTrialDays: zero and negatives are rejected", () => {
  assert.equal(validateTrialDays(0).ok, false);
  assert.equal(validateTrialDays(-1).ok, false);
  assert.equal(validateTrialDays(-30).ok, false);
});

test("validateTrialDays: a number field hands over strings, so digits-as-text must coerce", () => {
  assert.deepEqual(validateTrialDays("20"), { ok: true, value: 20 });
  assert.deepEqual(validateTrialDays(" 18 "), { ok: true, value: 18 });
});

test("validateTrialDays: fractions are rejected rather than silently truncated", () => {
  // 20.5 must NOT quietly become 20 — the admin should be told.
  const r = validateTrialDays(20.5);
  assert.equal(r.ok, false);
  assert.match(r.error, /whole number/i);
  assert.equal(r.value, undefined);
});

test("validateTrialDays: blank, null and undefined are rejected with the 'enter a value' message", () => {
  for (const v of ["", "   ", null, undefined]) {
    const r = validateTrialDays(v);
    assert.equal(r.ok, false, `${JSON.stringify(v)} should be rejected`);
    assert.match(r.error, /enter a trial period/i);
  }
});

test("validateTrialDays: non-numeric text is rejected as 'must be a number'", () => {
  const r = validateTrialDays("abc");
  assert.equal(r.ok, false);
  assert.match(r.error, /must be a number/i);
});

test("validateTrialDays: Infinity and NaN are rejected (Number() lets them through)", () => {
  assert.equal(validateTrialDays(Infinity).ok, false);
  assert.equal(validateTrialDays(-Infinity).ok, false);
  assert.equal(validateTrialDays(NaN).ok, false);
});

test("validateTrialDays: an out-of-range error names both bounds so the admin can correct it", () => {
  const r = validateTrialDays(99);
  assert.equal(r.ok, false);
  assert.match(r.error, /15/);
  assert.match(r.error, /30/);
});

test("validateTrialDays: a rejection never carries a value the caller could accidentally save", () => {
  for (const v of [14, 31, "abc", "", null, 20.5]) {
    assert.equal(validateTrialDays(v).value, undefined, `${JSON.stringify(v)} leaked a value`);
  }
});

// ── The 3-user cap during trial ─────────────────────────────────────────────

test("the trial seat cap is 3, counting the account creator", () => {
  assert.equal(TRIAL_USER_LIMIT, 3);
});

test("the limit message quotes the real number and points at upgrading", () => {
  assert.match(TRIAL_USER_LIMIT_MESSAGE, new RegExp(String(TRIAL_USER_LIMIT)));
  assert.match(TRIAL_USER_LIMIT_MESSAGE, /upgrade/i);
});

test("canAddTrialUser: a trialing workspace can invite up to but not beyond the cap", () => {
  const trial = (used) => ({ used, limit: TRIAL_USER_LIMIT, isTrialing: true });
  assert.equal(canAddTrialUser(trial(1)), true, "owner alone can invite");
  assert.equal(canAddTrialUser(trial(2)), true, "2 used can invite the 3rd");
  assert.equal(canAddTrialUser(trial(3)), false, "the 4th user is blocked");
});

test("canAddTrialUser: an over-limit workspace stays blocked rather than wrapping around", () => {
  // Reachable if the cap is ever lowered under existing accounts.
  assert.equal(canAddTrialUser({ used: 4, limit: 3, isTrialing: true }), false);
  assert.equal(canAddTrialUser({ used: 99, limit: 3, isTrialing: true }), false);
});

test("canAddTrialUser: the cap does not apply once the account is on a paid plan", () => {
  assert.equal(canAddTrialUser({ used: 3, limit: null, isTrialing: false }), true);
  assert.equal(canAddTrialUser({ used: 500, limit: null, isTrialing: false }), true);
});

test("canAddTrialUser: an expired or never-subscribed account is not capped by the trial rule", () => {
  // getTrialUserUsage reports limit: null for anything not status='trialing'.
  assert.equal(canAddTrialUser({ used: 10, limit: null, isTrialing: false }), true);
});

test("canAddTrialUser: isTrialing false wins even if a limit was somehow supplied", () => {
  // Defence in depth — the two fields should agree, but the trial flag is
  // the one that decides, so a stale limit can never block a paying customer.
  assert.equal(canAddTrialUser({ used: 9, limit: 3, isTrialing: false }), true);
});

test("canAddTrialUser: a brand-new workspace (owner only) always has room", () => {
  // The signup trigger inserts exactly one workspace_members row.
  assert.equal(canAddTrialUser({ used: 1, limit: TRIAL_USER_LIMIT, isTrialing: true }), true);
});
