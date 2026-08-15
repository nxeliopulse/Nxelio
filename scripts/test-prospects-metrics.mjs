import test from "node:test";
import assert from "node:assert/strict";
import { AI_SCORE_BANDS, scoreBandFor, buyingIntentFromScore, classifyEngagement } from "../src/lib/analytics/prospects-metrics.ts";

test("AI_SCORE_BANDS: five bands covering 0-100 with no gaps", () => {
  assert.equal(AI_SCORE_BANDS.length, 5);
  assert.equal(AI_SCORE_BANDS[0].label, "Very High");
  assert.equal(AI_SCORE_BANDS[AI_SCORE_BANDS.length - 1].label, "Very Low");
});

test("scoreBandFor: boundary scores land in the correct band", () => {
  assert.equal(scoreBandFor(100).label, "Very High");
  assert.equal(scoreBandFor(81).label, "Very High");
  assert.equal(scoreBandFor(80).label, "High");
  assert.equal(scoreBandFor(61).label, "High");
  assert.equal(scoreBandFor(60).label, "Medium");
  assert.equal(scoreBandFor(41).label, "Medium");
  assert.equal(scoreBandFor(40).label, "Low");
  assert.equal(scoreBandFor(21).label, "Low");
  assert.equal(scoreBandFor(20).label, "Very Low");
  assert.equal(scoreBandFor(0).label, "Very Low");
});

test("scoreBandFor: out-of-range values fall back to the lowest band instead of throwing", () => {
  assert.equal(scoreBandFor(-5).label, "Very Low");
  assert.equal(scoreBandFor(150).label, "Very Low");
});

test("buyingIntentFromScore: mirrors the AI score band label", () => {
  assert.equal(buyingIntentFromScore(90), "Very High");
  assert.equal(buyingIntentFromScore(10), "Very Low");
});

test("classifyEngagement: a reply or meeting always means High, regardless of touch count", () => {
  assert.equal(classifyEngagement({ hasReply: true, hasMeeting: false, touchCount: 0 }), "High");
  assert.equal(classifyEngagement({ hasReply: false, hasMeeting: true, touchCount: 0 }), "High");
});

test("classifyEngagement: outreach with no reply/meeting is Medium, zero touches is Low", () => {
  assert.equal(classifyEngagement({ hasReply: false, hasMeeting: false, touchCount: 1 }), "Medium");
  assert.equal(classifyEngagement({ hasReply: false, hasMeeting: false, touchCount: 0 }), "Low");
});
