"use server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/queries/audit-log";
import { revalidatePath } from "next/cache";
import type { ContactRow } from "@/lib/queries/contacts";

/**
 * Bulk-inserts contacts from a CSV import, modeled on bulkInsertLeads()
 * (src/lib/queries/leads.ts). Dedupes against existing contacts by
 * lowercased/trimmed email — contacts without an email can't be deduped this
 * way and are inserted as-is. Inserts the remaining rows in one batch.
 */
export async function bulkInsertContacts(
  contacts: Array<Partial<ContactRow>>
): Promise<{ inserted: number; duplicates: number; error?: string }> {
  if (!contacts.length) return { inserted: 0, duplicates: 0 };
  const supabase = await createClient();

  // Build a set of existing emails already in the DB to skip duplicates.
  const { data: existingRows } = await supabase.from("contacts").select("email");
  const norm = (s: string | null | undefined) => (s || "").toLowerCase().trim();
  const existing = new Set<string>();
  for (const r of existingRows || []) {
    if (r.email) existing.add(norm(r.email));
  }

  const seen = new Set<string>();
  let duplicates = 0;
  const rows: Array<Record<string, unknown>> = [];
  for (const c of contacts) {
    const email = c.email?.trim() || null;
    const emailKey = email ? norm(email) : null;
    // Only contacts with an email can be checked for duplicates — contacts
    // without one are always inserted (nothing to dedupe against).
    if (emailKey && (existing.has(emailKey) || seen.has(emailKey))) {
      duplicates++;
      continue;
    }
    if (emailKey) seen.add(emailKey);
    rows.push({
      account_id: c.account_id ?? null,
      contact_owner: c.contact_owner ?? null,
      salutation: c.salutation ?? null,
      // first_name/last_name are NOT NULL columns — fall back to "" rather
      // than dropping the row (validity already required at least one of them).
      first_name: (c.first_name ?? "").trim(),
      last_name: (c.last_name ?? "").trim(),
      email,
      phone: c.phone ?? null,
      mobile: c.mobile ?? null,
      home_phone: c.home_phone ?? null,
      other_phone: c.other_phone ?? null,
      department: c.department ?? null,
      job_title: c.job_title ?? null,
      lead_source: c.lead_source ?? "CSV Import",
      mailing_street: c.mailing_street ?? null,
      mailing_city: c.mailing_city ?? null,
      mailing_state: c.mailing_state ?? null,
      mailing_country: c.mailing_country ?? null,
      mailing_zip: c.mailing_zip ?? null,
      linkedin: c.linkedin ?? null,
      twitter: c.twitter ?? null,
    });
  }

  if (!rows.length) return { inserted: 0, duplicates };

  const { data, error } = await supabase.from("contacts").insert(rows).select();
  if (error) {
    console.error("bulkInsertContacts error:", error);
    return { inserted: 0, duplicates, error: error.message };
  }
  revalidatePath("/contacts");
  const inserted = data?.length ?? 0;
  if (inserted > 0) {
    await logAudit({
      action: "contact.bulk_imported",
      entityType: "contact",
      metadata: { count: inserted, duplicates, source: "CSV Import" },
    });
  }
  return { inserted, duplicates };
}
