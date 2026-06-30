"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface MeetingAttendee { name?: string; email?: string }

export interface MeetingRow {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  location: string | null;
  join_url: string | null;
  provider: string | null;
  status: "scheduled" | "completed" | "canceled" | string;
  lead_id: string | null;
  attendees: MeetingAttendee[];
  recording_url: string | null;
  summary: string | null;
  created_at: string;
  // Joined contact (LP-25)
  lead?: { id: string; full_name: string | null; company_name: string | null; email: string | null } | null;
}

export interface MeetingInput {
  title: string;
  description?: string | null;
  start_at: string;       // ISO
  end_at: string;         // ISO
  location?: string | null;
  join_url?: string | null;
  provider?: string | null;
  lead_id?: string | null;
  attendees?: MeetingAttendee[];
  recording_url?: string | null;
  summary?: string | null;
}

const SELECT = "id, title, description, start_at, end_at, location, join_url, provider, status, lead_id, attendees, recording_url, summary, created_at, lead:leads(id, full_name, company_name, email)";

export async function getMeetings(): Promise<MeetingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .select(SELECT)
    .order("start_at", { ascending: true });
  if (error) {
    // Table not migrated yet (0031) or query error — fail soft so the page renders.
    return [];
  }
  return (data as unknown as MeetingRow[]) ?? [];
}

export async function createMeeting(input: MeetingInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("meetings").insert({
    title: input.title,
    description: input.description ?? null,
    start_at: input.start_at,
    end_at: input.end_at,
    location: input.location ?? null,
    join_url: input.join_url ?? null,
    provider: input.provider ?? "manual",
    lead_id: input.lead_id || null,
    attendees: input.attendees ?? [],
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/meetings");
  return { ok: true };
}

export async function updateMeeting(id: string, input: Partial<MeetingInput> & { status?: string }): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  for (const k of ["title", "description", "start_at", "end_at", "location", "join_url", "provider", "lead_id", "attendees", "recording_url", "summary", "status"] as const) {
    if (k in input && input[k as keyof typeof input] !== undefined) patch[k] = input[k as keyof typeof input];
  }
  if (patch.lead_id === "") patch.lead_id = null;
  const { error } = await supabase.from("meetings").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/meetings");
  return { ok: true };
}

export async function cancelMeeting(id: string): Promise<{ ok: boolean; error?: string }> {
  return updateMeeting(id, { status: "canceled" });
}

export async function deleteMeeting(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("meetings").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/meetings");
  return { ok: true };
}
