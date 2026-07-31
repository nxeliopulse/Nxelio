"use server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/queries/audit-log";
import { revalidatePath } from "next/cache";
import { PICKLIST_FALLBACK_VALUES, type PicklistKey, type PicklistCategoryRow, type PicklistValueRow } from "@/lib/picklists";

/** Every picklist category + its values, for the admin Picklists tab. */
export async function getPicklistCategories(): Promise<PicklistCategoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("picklist_categories")
    .select("id, key, label, picklist_values(id, category_id, value, sort_order, is_active, is_system)")
    .order("key");
  if (error || !data) {
    console.error("getPicklistCategories error:", error?.message);
    return [];
  }
  return data.map((c) => ({
    id: c.id,
    key: c.key as PicklistKey,
    label: c.label,
    values: ((c.picklist_values as unknown as PicklistValueRow[]) || []).sort((a, b) => a.sort_order - b.sort_order),
  }));
}

/** Active values for one picklist, ordered — what every dropdown consumes. */
export async function getPicklistValues(key: PicklistKey): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data: category } = await supabase
      .from("picklist_categories")
      .select("id")
      .eq("key", key)
      .maybeSingle();
    if (!category) return PICKLIST_FALLBACK_VALUES[key];

    const { data: values, error } = await supabase
      .from("picklist_values")
      .select("value")
      .eq("category_id", category.id)
      .eq("is_active", true)
      .order("sort_order");
    if (error || !values || !values.length) return PICKLIST_FALLBACK_VALUES[key];
    return values.map((v) => v.value as string);
  } catch (err) {
    console.error("getPicklistValues error:", err);
    return PICKLIST_FALLBACK_VALUES[key];
  }
}

export async function createPicklistValue(categoryId: string, value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Value is required.");
  const supabase = await createClient();
  const { data: existing } = await supabase.from("picklist_values").select("id").eq("category_id", categoryId);
  const nextOrder = (existing?.length || 0) + 1;
  const { error } = await supabase.from("picklist_values").insert({ category_id: categoryId, value: trimmed, sort_order: nextOrder });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  await logAudit({ action: "picklist_value.created", entityType: "picklist_value", entityLabel: trimmed, metadata: { categoryId } });
}

export async function updatePicklistValue(id: string, payload: { value?: string; is_active?: boolean }): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (payload.value !== undefined) {
    const trimmed = payload.value.trim();
    if (!trimmed) throw new Error("Value is required.");
    patch.value = trimmed;
  }
  if (payload.is_active !== undefined) patch.is_active = payload.is_active;
  if (!Object.keys(patch).length) return;

  const supabase = await createClient();
  const { error } = await supabase.from("picklist_values").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  await logAudit({ action: "picklist_value.updated", entityType: "picklist_value", entityId: id, metadata: patch });
}

/** System values (e.g. "Converted") are set programmatically by app code and can't be removed from the admin UI. */
export async function deletePicklistValue(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("picklist_values").select("is_system, value").eq("id", id).single();
  if (row?.is_system) throw new Error(`"${row.value}" is a system value and can't be deleted.`);

  const { error } = await supabase.from("picklist_values").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  await logAudit({ action: "picklist_value.deleted", entityType: "picklist_value", entityId: id });
}

/** Bulk-persists a new top-to-bottom order after a drag/up-down reorder. */
export async function reorderPicklistValues(orderedIds: string[]): Promise<void> {
  const supabase = await createClient();
  await Promise.all(orderedIds.map((id, index) => supabase.from("picklist_values").update({ sort_order: index + 1 }).eq("id", id)));
  revalidatePath("/settings");
}
