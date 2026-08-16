import test from "node:test";
import assert from "node:assert/strict";
import { isScheduleDue } from "../src/lib/analytics/report-schedule-metrics.ts";

test("daily: not due before hour_utc", () => {
  const s = { frequency: "daily", dayOfWeek: null, dayOfMonth: null, hourUtc: 8, lastSentAt: null };
  assert.equal(isScheduleDue(s, new Date("2026-08-16T07:59:00Z")), false);
});

test("daily: due at or after hour_utc with no prior send", () => {
  const s = { frequency: "daily", dayOfWeek: null, dayOfMonth: null, hourUtc: 8, lastSentAt: null };
  assert.equal(isScheduleDue(s, new Date("2026-08-16T08:00:00Z")), true);
  assert.equal(isScheduleDue(s, new Date("2026-08-16T23:00:00Z")), true);
});

test("daily: not due again same day after already sent", () => {
  const s = { frequency: "daily", dayOfWeek: null, dayOfMonth: null, hourUtc: 8, lastSentAt: "2026-08-16T08:05:00Z" };
  assert.equal(isScheduleDue(s, new Date("2026-08-16T20:00:00Z")), false);
});

test("daily: due again the next day after already sent", () => {
  const s = { frequency: "daily", dayOfWeek: null, dayOfMonth: null, hourUtc: 8, lastSentAt: "2026-08-16T08:05:00Z" };
  assert.equal(isScheduleDue(s, new Date("2026-08-17T08:00:00Z")), true);
});

test("weekly: only due on the configured day of week", () => {
  const s = { frequency: "weekly", dayOfWeek: 1, dayOfMonth: null, hourUtc: 8, lastSentAt: null }; // Monday
  assert.equal(isScheduleDue(s, new Date("2026-08-16T09:00:00Z")), false); // Sunday
  assert.equal(isScheduleDue(s, new Date("2026-08-17T09:00:00Z")), true); // Monday
});

test("monthly: only due on the configured day of month", () => {
  const s = { frequency: "monthly", dayOfWeek: null, dayOfMonth: 1, hourUtc: 8, lastSentAt: null };
  assert.equal(isScheduleDue(s, new Date("2026-08-16T09:00:00Z")), false);
  assert.equal(isScheduleDue(s, new Date("2026-09-01T09:00:00Z")), true);
});
