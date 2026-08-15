// Pure, framework-free KPI formulas for the Analytics Overview page —
// no Supabase/Next.js imports, so this can be unit-tested directly with
// plain `node --test` (scripts/test-analytics-overview-metrics.mjs), the
// same way src/lib/kill-switch-rules.ts and idle-timeout-rules.ts are
// tested. src/lib/queries/analytics-overview.ts imports these rather than
// duplicating any formula inline — this file IS the "KPI Definition
// Service" the requirements doc calls for: every Overview number must
// trace back to a named function here, not ad-hoc arithmetic in a
// component or query file.

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "custom";

export type ComparisonMode = "previous_period" | "previous_month" | "previous_quarter" | "previous_year" | "none";

export interface DateRange {
  from: Date;
  to: Date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Resolves one of the ten required date-range presets against `now`.
 *  "custom" has no fixed resolution — callers must supply their own from/to
 *  and never call this function for that case. */
export function resolveDateRangePreset(preset: Exclude<DateRangePreset, "custom">, now: Date): DateRange {
  const today = startOfDay(now);
  switch (preset) {
    case "today":
      return { from: today, to: endOfDay(now) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: y, to: endOfDay(y) };
    }
    case "last_7_days": {
      const from = new Date(today);
      from.setDate(from.getDate() - 6); // inclusive of today = 7 days total
      return { from, to: endOfDay(now) };
    }
    case "last_30_days": {
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { from, to: endOfDay(now) };
    }
    case "last_90_days": {
      const from = new Date(today);
      from.setDate(from.getDate() - 89);
      return { from, to: endOfDay(now) };
    }
    case "this_month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    case "last_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from, to };
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return { from: new Date(now.getFullYear(), q * 3, 1), to: endOfDay(now) };
    }
    case "last_quarter": {
      const q = Math.floor(now.getMonth() / 3) - 1;
      const year = q < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const qq = (q + 4) % 4;
      const from = new Date(year, qq * 3, 1);
      const to = new Date(year, qq * 3 + 3, 0, 23, 59, 59, 999);
      return { from, to };
    }
    case "this_year":
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
  }
}

/** Chart granularity: ≤31 days daily, 32–120 days weekly, >120 days monthly
 *  (requirements doc §9 "Revenue Trend"). */
export function bucketDateRange(range: DateRange): "daily" | "weekly" | "monthly" {
  const days = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000));
  if (days <= 31) return "daily";
  if (days <= 120) return "weekly";
  return "monthly";
}

/** The comparison window for a given mode, immediately preceding `range`.
 *  Returns null for "none" — callers must skip period-over-period display. */
export function previousPeriodRange(range: DateRange, mode: ComparisonMode): DateRange | null {
  if (mode === "none") return null;
  const spanMs = range.to.getTime() - range.from.getTime();
  switch (mode) {
    case "previous_period":
      return { from: new Date(range.from.getTime() - spanMs - 1), to: new Date(range.from.getTime() - 1) };
    case "previous_month":
      return {
        from: new Date(range.from.getFullYear(), range.from.getMonth() - 1, range.from.getDate()),
        to: new Date(range.to.getFullYear(), range.to.getMonth() - 1, range.to.getDate(), 23, 59, 59, 999),
      };
    case "previous_quarter":
      return {
        from: new Date(range.from.getFullYear(), range.from.getMonth() - 3, range.from.getDate()),
        to: new Date(range.to.getFullYear(), range.to.getMonth() - 3, range.to.getDate(), 23, 59, 59, 999),
      };
    case "previous_year":
      return {
        from: new Date(range.from.getFullYear() - 1, range.from.getMonth(), range.from.getDate()),
        to: new Date(range.to.getFullYear() - 1, range.to.getMonth(), range.to.getDate(), 23, 59, 59, 999),
      };
  }
}

/** Percentage change of `current` vs `previous`. Null when there's no
 *  previous value to compare against (avoids a meaningless "+Infinity%"). */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Reply Rate = Unique Prospect Replies / Delivered Outreach × 100 (doc §6.2). */
export function calcReplyRate(replies: number, delivered: number): number {
  return delivered > 0 ? Math.round((replies / delivered) * 1000) / 10 : 0;
}

/** Win Rate = Won / (Won + Lost) × 100 — open opportunities are never
 *  included (doc §6.7). */
export function calcWinRate(won: number, lost: number): number {
  const closed = won + lost;
  return closed > 0 ? Math.round((won / closed) * 1000) / 10 : 0;
}

/** Qualification Rate = Qualified Prospects / Meetings Completed × 100 (doc §24). */
export function calcQualificationRate(qualified: number, meetingsCompleted: number): number {
  return meetingsCompleted > 0 ? Math.round((qualified / meetingsCompleted) * 1000) / 10 : 0;
}

/** Weighted Pipeline = Σ(Opportunity Amount × Probability) across OPEN
 *  opportunities only (doc §6.8/§14). Probability comes from
 *  getStageForecast() in src/lib/opportunities.ts — reused here, not
 *  duplicated, since there's no per-opportunity probability column. */
export function calcWeightedForecast(
  openOpportunities: { dealValue: number; probabilityPercent: number }[]
): number {
  return openOpportunities.reduce((sum, o) => sum + o.dealValue * (o.probabilityPercent / 100), 0);
}

/** Conversion rate from one funnel stage to the previous one (doc §7). */
export function calcStageConversion(currentCount: number, previousCount: number): number {
  return previousCount > 0 ? Math.round((currentCount / previousCount) * 1000) / 10 : 0;
}
