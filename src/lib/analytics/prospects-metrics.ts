// Pure, framework-free logic for the Prospects Analytics page — same
// convention as overview-metrics.ts (unit-testable via plain `node --test`,
// no Supabase/Next.js imports). src/lib/queries/analytics-prospects.ts
// imports these rather than duplicating the formulas inline.

export interface ScoreBand {
  min: number;
  max: number;
  label: string;
}

/** Doc's suggested 0-100 scoring bands (requirements doc, Prospects §7). */
export const AI_SCORE_BANDS: ScoreBand[] = [
  { min: 81, max: 100, label: "Very High" },
  { min: 61, max: 80, label: "High" },
  { min: 41, max: 60, label: "Medium" },
  { min: 21, max: 40, label: "Low" },
  { min: 0, max: 20, label: "Very Low" },
];

/** Which band a raw AI score falls into. Falls back to the lowest band for
 *  out-of-range/negative values rather than throwing — bad data shouldn't
 *  crash the whole analytics page. */
export function scoreBandFor(score: number): ScoreBand {
  for (const band of AI_SCORE_BANDS) {
    if (score >= band.min && score <= band.max) return band;
  }
  return AI_SCORE_BANDS[AI_SCORE_BANDS.length - 1];
}

/**
 * Buying Intent has no dedicated field in this schema — approximated from
 * the same AI score bands used for scoring (doc doesn't specify a separate
 * source for it). Documented here as the one place this approximation is
 * made, so it can be swapped for a real signal later without hunting
 * through every call site.
 */
export function buyingIntentFromScore(score: number): string {
  return scoreBandFor(score).label;
}

export type EngagementLevel = "High" | "Medium" | "Low";

/**
 * Engagement Level (doc §9) — computed, not stored. "High" requires a real
 * conversion signal (reply or meeting), not just outreach volume, per the
 * doc's own definition ("recent meaningful activity such as reply, meeting,
 * repeated clicks"). Anything with at least one outreach touch but no reply
 * or meeting is "Medium"; no activity at all is "Low".
 */
export function classifyEngagement(signal: { hasReply: boolean; hasMeeting: boolean; touchCount: number }): EngagementLevel {
  if (signal.hasReply || signal.hasMeeting) return "High";
  if (signal.touchCount > 0) return "Medium";
  return "Low";
}
