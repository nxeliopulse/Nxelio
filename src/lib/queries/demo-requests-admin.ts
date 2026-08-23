"use server";
import { createAdminClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/queries/platform-admin";

export type DemoRequestStatus = "new" | "contacted" | "completed" | "canceled";

export interface DemoRequestRow {
  id: string;
  full_name: string;
  business_email: string;
  phone: string;
  industry: string;
  employee_count: string;
  monthly_revenue: string;
  purpose: string | null;
  referral_source: string | null;
  requested_date: string;
  requested_time: string;
  meeting_start_at: string;
  join_url: string | null;
  status: DemoRequestStatus;
  created_at: string;
}

/** Every demo booked from the landing page, newest first — for admin triage. */
export async function getDemoRequests(): Promise<DemoRequestRow[]> {
  if (!(await isPlatformAdmin())) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("demo_requests")
    .select("id, full_name, business_email, phone, industry, employee_count, monthly_revenue, purpose, referral_source, requested_date, requested_time, meeting_start_at, join_url, status, created_at")
    .order("created_at", { ascending: false });
  return (data as DemoRequestRow[] | null) ?? [];
}

export async function updateDemoRequestStatus(id: string, status: DemoRequestStatus): Promise<{ ok: boolean; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };
  const admin = createAdminClient();
  const { error } = await admin.from("demo_requests").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
