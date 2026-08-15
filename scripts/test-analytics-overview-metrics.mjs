import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveDateRangePreset,
  bucketDateRange,
  previousPeriodRange,
  percentChange,
  calcReplyRate,
  calcWinRate,
  calcQualificationRate,
  calcWeightedForecast,
  calcStageConversion,
} from "../src/lib/analytics/overview-metrics.ts";

const NOW = new Date(2026, 7, 14, 15, 30, 0); // Aug 14 2026, 3:30pm — matches this session's "today"

test("resolveDateRangePreset: today/yesterday cover exactly one calendar day", () => {
  const today = resolveDateRangePreset("today", NOW);
  assert.equal(today.from.getDate(), 14);
  assert.equal(today.to.getDate(), 14);

  const yesterday = resolveDateRangePreset("yesterday", NOW);
  assert.equal(yesterday.from.getDate(), 13);
  assert.equal(yesterday.to.getDate(), 13);
});

test("resolveDateRangePreset: last_7_days / last_30_days / last_90_days include today", () => {
  // `to` runs through end-of-day today, so the rounded span is the full
  // inclusive day count (7/30/90), not day-count-minus-one.
  const last7 = resolveDateRangePreset("last_7_days", NOW);
  assert.equal(Math.round((last7.to.getTime() - last7.from.getTime()) / 86_400_000), 7);

  const last30 = resolveDateRangePreset("last_30_days", NOW);
  assert.equal(Math.round((last30.to.getTime() - last30.from.getTime()) / 86_400_000), 30);

  const last90 = resolveDateRangePreset("last_90_days", NOW);
  assert.equal(Math.round((last90.to.getTime() - last90.from.getTime()) / 86_400_000), 90);
});

test("resolveDateRangePreset: this_month / last_month boundaries", () => {
  const thisMonth = resolveDateRangePreset("this_month", NOW);
  assert.equal(thisMonth.from.getMonth(), 7); // August
  assert.equal(thisMonth.from.getDate(), 1);

  const lastMonth = resolveDateRangePreset("last_month", NOW);
  assert.equal(lastMonth.from.getMonth(), 6); // July
  assert.equal(lastMonth.from.getDate(), 1);
  assert.equal(lastMonth.to.getMonth(), 6);
  assert.equal(lastMonth.to.getDate(), 31); // July has 31 days
});

test("resolveDateRangePreset: this_quarter / last_quarter boundaries", () => {
  const thisQuarter = resolveDateRangePreset("this_quarter", NOW); // Aug -> Q3 (Jul-Sep)
  assert.equal(thisQuarter.from.getMonth(), 6);

  const lastQuarter = resolveDateRangePreset("last_quarter", NOW); // Q2 (Apr-Jun)
  assert.equal(lastQuarter.from.getMonth(), 3);
  assert.equal(lastQuarter.to.getMonth(), 5);
});

test("resolveDateRangePreset: last_quarter rolls back into the previous year from Q1", () => {
  const q1Now = new Date(2026, 1, 10); // Feb 2026 -> Q1
  const lastQuarter = resolveDateRangePreset("last_quarter", q1Now);
  assert.equal(lastQuarter.from.getFullYear(), 2025);
  assert.equal(lastQuarter.from.getMonth(), 9); // Q4 = Oct-Dec
});

test("resolveDateRangePreset: this_year starts January 1st", () => {
  const thisYear = resolveDateRangePreset("this_year", NOW);
  assert.equal(thisYear.from.getMonth(), 0);
  assert.equal(thisYear.from.getDate(), 1);
});

test("bucketDateRange: daily <=31 days, weekly 32-120 days, monthly >120 days", () => {
  assert.equal(bucketDateRange({ from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) }), "daily");
  assert.equal(bucketDateRange({ from: new Date(2026, 0, 1), to: new Date(2026, 2, 1) }), "weekly"); // ~60 days
  assert.equal(bucketDateRange({ from: new Date(2026, 0, 1), to: new Date(2026, 5, 1) }), "monthly"); // ~150 days
});

test("previousPeriodRange: none returns null", () => {
  const range = { from: new Date(2026, 7, 1), to: new Date(2026, 7, 14) };
  assert.equal(previousPeriodRange(range, "none"), null);
});

test("previousPeriodRange: previous_period is the immediately preceding equal-length window", () => {
  const range = { from: new Date(2026, 7, 1), to: new Date(2026, 7, 14) }; // 13-day span
  const prev = previousPeriodRange(range, "previous_period");
  assert.ok(prev.to.getTime() < range.from.getTime());
  const spanMs = range.to.getTime() - range.from.getTime();
  assert.equal(Math.round((prev.to.getTime() - prev.from.getTime()) / 1000), Math.round(spanMs / 1000));
});

test("previousPeriodRange: previous_month/quarter/year shift by calendar units", () => {
  const range = { from: new Date(2026, 7, 1), to: new Date(2026, 7, 14) };
  assert.equal(previousPeriodRange(range, "previous_month").from.getMonth(), 6);
  assert.equal(previousPeriodRange(range, "previous_quarter").from.getMonth(), 4);
  assert.equal(previousPeriodRange(range, "previous_year").from.getFullYear(), 2025);
});

test("percentChange: normal increase/decrease and zero-previous edge cases", () => {
  assert.equal(percentChange(120, 100), 20);
  assert.equal(percentChange(80, 100), -20);
  assert.equal(percentChange(0, 0), 0); // no change at all
  assert.equal(percentChange(50, 0), null); // can't compute a % off zero
});

test("calcReplyRate: replies / delivered, 0 when nothing delivered", () => {
  assert.equal(calcReplyRate(50, 500), 10);
  assert.equal(calcReplyRate(0, 0), 0);
});

test("calcWinRate: won / (won + lost), open opportunities never included", () => {
  assert.equal(calcWinRate(18, 54), 25);
  assert.equal(calcWinRate(0, 0), 0);
});

test("calcQualificationRate: qualified / meetings completed", () => {
  assert.equal(calcQualificationRate(214, 386), 55.4);
  assert.equal(calcQualificationRate(5, 0), 0);
});

test("calcWeightedForecast: sums dealValue * probability across open opportunities", () => {
  const total = calcWeightedForecast([
    { dealValue: 100_000, probabilityPercent: 60 }, // 60,000
    { dealValue: 50_000, probabilityPercent: 80 }, // 40,000
  ]);
  assert.equal(total, 100_000);
  assert.equal(calcWeightedForecast([]), 0);
});

test("calcStageConversion: current / previous stage count, 0 when previous stage is empty", () => {
  assert.equal(calcStageConversion(195, 975), 20);
  assert.equal(calcStageConversion(10, 0), 0);
});
