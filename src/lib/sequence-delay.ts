export type DelayUnit = "minutes" | "hours" | "days";
export const DELAY_UNITS: DelayUnit[] = ["minutes", "hours", "days"];

/** value + unit → a human, parseable label stored in a step's `day` field. */
export function formatDelay(value: number, unit: DelayUnit): string {
  if (!value || value <= 0) return "No delay";
  const u = value === 1 ? unit.replace(/s$/, "") : unit;
  return `${value} ${u}`;
}

/** Tolerant parse of a delay label back into value + unit. Handles the legacy
 *  "Day N" format and the new "3 days / 2 hours / 30 minutes" format. */
export function parseDelay(label: string | null | undefined): { value: number; unit: DelayUnit } {
  if (!label) return { value: 0, unit: "days" };
  const l = label.trim().toLowerCase();
  if (/^(start|no delay|immediately|day\s*1\b)/.test(l)) return { value: 0, unit: "days" };
  let m = l.match(/^day\s*(\d+)/);
  if (m) return { value: parseInt(m[1], 10), unit: "days" };
  m = l.match(/(\d+)\s*(minute|hour|day)s?/);
  if (m) return { value: parseInt(m[1], 10), unit: (m[2] + "s") as DelayUnit };
  return { value: 0, unit: "days" };
}

/** Convert a delay to minutes — used by the scheduler when queueing steps. */
export function delayToMinutes(value: number, unit: DelayUnit): number {
  if (unit === "minutes") return value;
  if (unit === "hours") return value * 60;
  return value * 60 * 24;
}
