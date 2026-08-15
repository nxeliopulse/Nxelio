import test from "node:test";
import assert from "node:assert/strict";
import { classifyReplyHeuristic, dayHourBucket, HOUR_BLOCK_LABELS, DAY_LABELS } from "../src/lib/analytics/engagement-metrics.ts";

test("classifyReplyHeuristic: recognizes unsubscribe requests", () => {
  assert.equal(classifyReplyHeuristic("Please unsubscribe me from this list"), "Unsubscribe");
});

test("classifyReplyHeuristic: recognizes out-of-office auto-replies", () => {
  assert.equal(classifyReplyHeuristic("I am currently out of the office and will return Monday"), "Out of Office");
});

test("classifyReplyHeuristic: recognizes not-interested replies", () => {
  assert.equal(classifyReplyHeuristic("Not interested, please stop contacting me"), "Not Interested");
});

test("classifyReplyHeuristic: recognizes meeting requests", () => {
  assert.equal(classifyReplyHeuristic("Sure, let's schedule a call next week"), "Meeting Request");
});

test("classifyReplyHeuristic: recognizes positive sentiment", () => {
  assert.equal(classifyReplyHeuristic("This sounds good, tell me more"), "Positive");
});

test("classifyReplyHeuristic: recognizes negative sentiment without an explicit decline", () => {
  assert.equal(classifyReplyHeuristic("We already have a vendor for this and no budget right now"), "Negative");
});

test("classifyReplyHeuristic: falls back to Neutral for ambiguous text", () => {
  assert.equal(classifyReplyHeuristic("Thanks for reaching out."), "Neutral");
});

test("dayHourBucket: maps hours into the six 4-hour blocks", () => {
  assert.equal(dayHourBucket(new Date(2026, 7, 10, 0, 0)).hourBlock, "12 AM");
  assert.equal(dayHourBucket(new Date(2026, 7, 10, 3, 59)).hourBlock, "12 AM");
  assert.equal(dayHourBucket(new Date(2026, 7, 10, 4, 0)).hourBlock, "4 AM");
  assert.equal(dayHourBucket(new Date(2026, 7, 10, 11, 59)).hourBlock, "8 AM");
  assert.equal(dayHourBucket(new Date(2026, 7, 10, 12, 0)).hourBlock, "12 PM");
  assert.equal(dayHourBucket(new Date(2026, 7, 10, 23, 59)).hourBlock, "8 PM");
});

test("dayHourBucket: maps the weekday correctly", () => {
  // Aug 10 2026 is a Monday
  assert.equal(dayHourBucket(new Date(2026, 7, 10, 9, 0)).day, "Monday");
});

test("HOUR_BLOCK_LABELS / DAY_LABELS: expected fixed sizes for the heatmap grid", () => {
  assert.equal(HOUR_BLOCK_LABELS.length, 6);
  assert.equal(DAY_LABELS.length, 7);
});
