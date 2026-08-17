"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isScheduleDue, type ScheduleFrequency } from "@/lib/analytics/report-schedule-metrics";
import { runReportAsAdmin, getReportById } from "@/lib/queries/analytics-reports";
import type { ReportResultRow } from "@/lib/analytics-reports";
import { sendEmail } from "@/lib/email/resend";

export interface ReportScheduleRow {
  id: string;
  reportId: string;
  recipients: string[];
  frequency: ScheduleFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hourUtc: number;
  isActive: boolean;
  lastSentAt: string | null;
}

interface ScheduleDbRow {
  id: string;
  workspace_id: string;
  report_id: string;
  recipients: string[];
  frequency: ScheduleFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
  hour_utc: number;
  is_active: boolean;
  last_sent_at: string | null;
}

function toRow(r: ScheduleDbRow): ReportScheduleRow {
  return {
    id: r.id,
    reportId: r.report_id,
    recipients: r.recipients,
    frequency: r.frequency,
    dayOfWeek: r.day_of_week,
    dayOfMonth: r.day_of_month,
    hourUtc: r.hour_utc,
    isActive: r.is_active,
    lastSentAt: r.last_sent_at,
  };
}

export async function listReportSchedules(reportId: string): Promise<ReportScheduleRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("report_schedules").select("*").eq("report_id", reportId).order("created_at", { ascending: false });
  return ((data as ScheduleDbRow[]) || []).map(toRow);
}

export interface ScheduleInput {
  reportId: string;
  recipients: string[];
  frequency: ScheduleFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hourUtc: number;
}

export async function createReportSchedule(input: ScheduleInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("report_schedules").insert({
    report_id: input.reportId,
    recipients: input.recipients,
    frequency: input.frequency,
    day_of_week: input.frequency === "weekly" ? input.dayOfWeek : null,
    day_of_month: input.frequency === "monthly" ? input.dayOfMonth : null,
    hour_utc: input.hourUtc,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/analytics/reports/${input.reportId}`);
  return { ok: true };
}

export async function toggleReportSchedule(id: string, isActive: boolean): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("report_schedules").update({ is_active: isActive }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteReportSchedule(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("report_schedules").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function toCsv(rows: ReportResultRow[]): string {
  const hasValue2 = rows.some((r) => r.value2 != null);
  const lines = [hasValue2 ? "Label,Value,Value2" : "Label,Value"];
  for (const r of rows) {
    const label = `"${r.label.replace(/"/g, '""')}"`;
    lines.push(hasValue2 ? `${label},${r.value},${r.value2 ?? ""}` : `${label},${r.value}`);
  }
  return lines.join("\n");
}

/** Called hourly by the protected cron route
 *  (/api/analytics/report-schedules/cron) — checks every active schedule,
 *  runs its report and emails a CSV to its recipients if due. Uses the
 *  service-role client throughout since there's no user session. */
export async function runDueReportSchedules(): Promise<{ checked: number; sent: number }> {
  const admin = createAdminClient();
  const { data } = await admin.from("report_schedules").select("*").eq("is_active", true);
  const schedules = (data as ScheduleDbRow[]) || [];
  const now = new Date();
  let sent = 0;

  for (const s of schedules) {
    const due = isScheduleDue({ frequency: s.frequency, dayOfWeek: s.day_of_week, dayOfMonth: s.day_of_month, hourUtc: s.hour_utc, lastSentAt: s.last_sent_at }, now);
    if (!due) continue;

    const def = await getReportById(s.report_id);
    if (!def) continue;
    const result = await runReportAsAdmin(def);
    const csv = toCsv(result.rows);
    const contentBase64 = Buffer.from(csv, "utf-8").toString("base64");
    const filename = `${def.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${now.toISOString().slice(0, 10)}.csv`;

    for (const recipient of s.recipients) {
      await sendEmail({
        to: recipient,
        subject: `Scheduled report: ${def.name}`,
        text: `Your scheduled report "${def.name}" is attached as a CSV (${result.rows.length} rows).`,
        attachments: [{ filename, contentBase64 }],
      });
    }
    await admin.from("report_schedules").update({ last_sent_at: now.toISOString() }).eq("id", s.id);
    sent += 1;
  }

  return { checked: schedules.length, sent };
}
