// Pure, framework-free logic for the Pipeline & Opportunities Analytics
// page — same convention as the other analytics/*-metrics.ts files.

export interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null; // null = open-ended (90+)
}

/** The doc's fixed aging buckets (Pipeline & Opportunities §13). */
export const AGING_BUCKETS: AgingBucket[] = [
  { label: "0–7 Days", minDays: 0, maxDays: 7 },
  { label: "8–14 Days", minDays: 8, maxDays: 14 },
  { label: "15–30 Days", minDays: 15, maxDays: 30 },
  { label: "31–60 Days", minDays: 31, maxDays: 60 },
  { label: "61–90 Days", minDays: 61, maxDays: 90 },
  { label: "90+ Days", minDays: 91, maxDays: null },
];

/** Which aging bucket a deal's age (in days) falls into. Negative ages
 *  (clock skew / bad data) fall into the first bucket rather than throwing. */
export function agingBucketFor(ageDays: number): AgingBucket {
  const safe = Math.max(ageDays, 0);
  for (const bucket of AGING_BUCKETS) {
    if (safe >= bucket.minDays && (bucket.maxDays === null || safe <= bucket.maxDays)) return bucket;
  }
  return AGING_BUCKETS[AGING_BUCKETS.length - 1];
}

/** Days between two ISO timestamps (or a timestamp and now), floored at 0. */
export function daysBetween(fromISO: string, toISO: string): number {
  const ms = new Date(toISO).getTime() - new Date(fromISO).getTime();
  return Math.max(Math.floor(ms / 86_400_000), 0);
}

/**
 * Whether an opportunity counts as "stalled" — no meaningful activity for
 * more than `thresholdDays` (doc's own example: 14 days). Configurable per
 * the doc's "Definition should be configurable" instruction rather than a
 * hardcoded constant.
 */
export function isStalled(lastActivityISO: string | null, nowISO: string, thresholdDays = 14): boolean {
  if (!lastActivityISO) return true; // never touched at all — treat as stalled
  return daysBetween(lastActivityISO, nowISO) > thresholdDays;
}
