"use server";
import { createAdminClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/queries/platform-admin";

export interface DemoCallPerson {
  id: string;
  name: string;
  emails: string[];
  designation: string | null;
  created_at: string;
}

export interface DemoCallSlotAssignment {
  id: string;
  person_id: string;
  name: string;
  emails: string[];
  designation: string | null;
  is_live: boolean;
}

export interface DemoCallSlot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  assignments: DemoCallSlotAssignment[];
}

function normalizeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of emails) {
    const e = raw.trim().toLowerCase();
    if (e) seen.add(e);
  }
  return Array.from(seen);
}

export async function getDemoCallPeople(): Promise<DemoCallPerson[]> {
  if (!(await isPlatformAdmin())) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("demo_call_people")
    .select("id, name, emails, designation, created_at")
    .order("created_at", { ascending: true });
  return (data as DemoCallPerson[] | null) ?? [];
}

export async function addDemoCallPerson(input: { name: string; emails: string[]; designation?: string }): Promise<{ ok: boolean; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };
  const name = input.name.trim();
  const emails = normalizeEmails(input.emails);
  if (!name) return { ok: false, error: "Enter a name." };
  if (!emails.length) return { ok: false, error: "Add at least one email." };
  if (emails.some((e) => !e.includes("@"))) return { ok: false, error: "One of those emails doesn't look valid." };

  const admin = createAdminClient();
  const { data: person, error } = await admin
    .from("demo_call_people")
    .insert({ name, emails, designation: input.designation?.trim() || null })
    .select("id")
    .single();
  if (error || !person) return { ok: false, error: error?.message || "Couldn't add that person." };

  // The new person becomes a (non-live) candidate for every slot that already exists.
  const { data: slots } = await admin.from("demo_call_slots").select("id");
  if (slots && slots.length) {
    const personId = (person as { id: string }).id;
    await admin.from("demo_call_slot_assignments").insert(
      (slots as { id: string }[]).map((s) => ({ slot_id: s.id, person_id: personId, is_live: false }))
    );
  }
  return { ok: true };
}

/** Removing a person also removes them from every slot (ON DELETE CASCADE). */
export async function removeDemoCallPerson(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };
  const admin = createAdminClient();
  const { error } = await admin.from("demo_call_people").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getDemoCallSlots(): Promise<DemoCallSlot[]> {
  if (!(await isPlatformAdmin())) return [];
  const admin = createAdminClient();
  const { data: slots } = await admin
    .from("demo_call_slots")
    .select("id, slot_date, start_time, end_time")
    .order("slot_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (!slots || !slots.length) return [];

  const { data: assignments } = await admin
    .from("demo_call_slot_assignments")
    .select("id, slot_id, is_live, demo_call_people(id, name, emails, designation)")
    .order("created_at", { ascending: true });

  const bySlot = new Map<string, DemoCallSlotAssignment[]>();
  for (const row of (assignments as { id: string; slot_id: string; is_live: boolean; demo_call_people: unknown }[] | null) ?? []) {
    const person = row.demo_call_people as { id: string; name: string; emails: string[] | null; designation: string | null } | null;
    if (!person) continue;
    const list = bySlot.get(row.slot_id) ?? [];
    list.push({ id: row.id, person_id: person.id, name: person.name, emails: person.emails ?? [], designation: person.designation, is_live: row.is_live });
    bySlot.set(row.slot_id, list);
  }

  return (slots as { id: string; slot_date: string; start_time: string; end_time: string }[]).map((s) => ({
    ...s,
    assignments: bySlot.get(s.id) ?? [],
  }));
}

/** Creates a slot and immediately assigns every current person to it as a
 *  candidate — `personId` (if given) starts out as the live one. */
export async function addDemoCallSlot(input: { personId: string; date: string; startTime: string; endTime: string }): Promise<{ ok: boolean; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };
  if (!input.date) return { ok: false, error: "Pick a date." };
  if (!input.startTime || !input.endTime) return { ok: false, error: "Pick a start and end time." };
  if (input.endTime <= input.startTime) return { ok: false, error: "End time must be after start time." };

  const admin = createAdminClient();
  const { data: slot, error } = await admin
    .from("demo_call_slots")
    .insert({ slot_date: input.date, start_time: input.startTime, end_time: input.endTime })
    .select("id")
    .single();
  if (error || !slot) return { ok: false, error: error?.message || "Couldn't create that slot." };

  const { data: people } = await admin.from("demo_call_people").select("id");
  if (people && people.length) {
    const slotId = (slot as { id: string }).id;
    await admin.from("demo_call_slot_assignments").insert(
      (people as { id: string }[]).map((p) => ({
        slot_id: slotId,
        person_id: p.id,
        is_live: Boolean(input.personId) && p.id === input.personId,
      }))
    );
  }
  return { ok: true };
}

/** Marks one assignment live and clears every other assignment in the same
 *  slot first — that's what "toggling this person ON turns everyone else in
 *  the slot OFF" actually is, and avoids ever tripping the DB's one-live-per-
 *  slot unique index. */
export async function setSlotAssignmentLive(assignmentId: string, slotId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };
  const admin = createAdminClient();
  const { error: clearErr } = await admin
    .from("demo_call_slot_assignments")
    .update({ is_live: false })
    .eq("slot_id", slotId)
    .neq("id", assignmentId);
  if (clearErr) return { ok: false, error: clearErr.message };
  const { error } = await admin.from("demo_call_slot_assignments").update({ is_live: true }).eq("id", assignmentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function clearSlotAssignmentLive(assignmentId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };
  const admin = createAdminClient();
  const { error } = await admin.from("demo_call_slot_assignments").update({ is_live: false }).eq("id", assignmentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Removes one person from one slot only — doesn't touch the person record
 *  or their assignments to any other slot. */
export async function deleteSlotAssignment(assignmentId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };
  const admin = createAdminClient();
  const { error } = await admin.from("demo_call_slot_assignments").delete().eq("id", assignmentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Finds whoever is live for the demo-call slot covering a given date + time
 *  of day, if any — used to route a newly-booked demo's notification/join
 *  link to the right rep's inbox(es) instead of only the general sales inbox.
 *  Not admin-gated: called internally from the public booking flow, never
 *  exposed to a client directly. */
export async function getLiveRepForSlot(dateStr: string, timeHHMMSS: string): Promise<{ name: string; emails: string[] } | null> {
  const admin = createAdminClient();
  const { data: slots } = await admin
    .from("demo_call_slots")
    .select("id")
    .eq("slot_date", dateStr)
    .lte("start_time", timeHHMMSS)
    .gt("end_time", timeHHMMSS);
  if (!slots || !slots.length) return null;

  const { data: assignment } = await admin
    .from("demo_call_slot_assignments")
    .select("demo_call_people(name, emails)")
    .in("slot_id", (slots as { id: string }[]).map((s) => s.id))
    .eq("is_live", true)
    .limit(1)
    .maybeSingle();
  const person = (assignment as { demo_call_people: unknown } | null)?.demo_call_people as { name: string; emails: string[] | null } | null;
  return person ? { name: person.name, emails: person.emails ?? [] } : null;
}
