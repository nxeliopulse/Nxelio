export type ScheduleFrequency = "daily" | "weekly" | "monthly";

export interface ScheduleTiming {
  frequency: ScheduleFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hourUtc: number;
  lastSentAt: string | null;
}

/** Pure due-check for report_schedules (migration 0131). A schedule is due
 *  once `now` has reached its hour on the right day, and it hasn't already
 *  been sent since the start of that day — so an hourly cron poll sends
 *  each schedule exactly once per occurrence, whichever poll first reaches
 *  or passes hour_utc. */
export function isScheduleDue(schedule: ScheduleTiming, now: Date): boolean {
  if (now.getUTCHours() < schedule.hourUtc) return false;

  if (schedule.frequency === "weekly" && schedule.dayOfWeek != null && now.getUTCDay() !== schedule.dayOfWeek) return false;
  if (schedule.frequency === "monthly" && schedule.dayOfMonth != null && now.getUTCDate() !== schedule.dayOfMonth) return false;

  if (!schedule.lastSentAt) return true;
  const last = new Date(schedule.lastSentAt);
  const startOfTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return last.getTime() < startOfTodayUtc;
}
