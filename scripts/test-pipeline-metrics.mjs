import test from "node:test";
import assert from "node:assert/strict";
import { AGING_BUCKETS, agingBucketFor, daysBetween, isStalled } from "../src/lib/analytics/pipeline-metrics.ts";

test("AGING_BUCKETS: six buckets, last one open-ended", () => {
  assert.equal(AGING_BUCKETS.length, 6);
  assert.equal(AGING_BUCKETS[AGING_BUCKETS.length - 1].maxDays, null);
});

test("agingBucketFor: boundary days land in the correct bucket", () => {
  assert.equal(agingBucketFor(0).label, "0–7 Days");
  assert.equal(agingBucketFor(7).label, "0–7 Days");
  assert.equal(agingBucketFor(8).label, "8–14 Days");
  assert.equal(agingBucketFor(14).label, "8–14 Days");
  assert.equal(agingBucketFor(15).label, "15–30 Days");
  assert.equal(agingBucketFor(30).label, "15–30 Days");
  assert.equal(agingBucketFor(31).label, "31–60 Days");
  assert.equal(agingBucketFor(60).label, "31–60 Days");
  assert.equal(agingBucketFor(61).label, "61–90 Days");
  assert.equal(agingBucketFor(90).label, "61–90 Days");
  assert.equal(agingBucketFor(91).label, "90+ Days");
  assert.equal(agingBucketFor(500).label, "90+ Days");
});

test("agingBucketFor: negative age (bad data) falls into the first bucket", () => {
  assert.equal(agingBucketFor(-5).label, "0–7 Days");
});

test("daysBetween: whole days between two ISO timestamps", () => {
  assert.equal(daysBetween("2026-08-01T00:00:00Z", "2026-08-11T00:00:00Z"), 10);
  assert.equal(daysBetween("2026-08-11T00:00:00Z", "2026-08-01T00:00:00Z"), 0); // never negative
});

test("isStalled: no last-activity timestamp at all counts as stalled", () => {
  assert.equal(isStalled(null, "2026-08-14T00:00:00Z"), true);
});

test("isStalled: respects the configurable threshold, default 14 days", () => {
  assert.equal(isStalled("2026-08-01T00:00:00Z", "2026-08-10T00:00:00Z"), false); // 9 days
  assert.equal(isStalled("2026-08-01T00:00:00Z", "2026-08-20T00:00:00Z"), true); // 19 days
  assert.equal(isStalled("2026-08-01T00:00:00Z", "2026-08-10T00:00:00Z", 5), true); // custom threshold
});
