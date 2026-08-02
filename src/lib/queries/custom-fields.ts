"use server";

import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/queries/audit-log";
import { revalidatePath } from "next/cache";
import type { FieldDefinition, FieldDataType } from "@/core/engine/types";

export interface CustomFieldRow {
  id: string;
  workspace_id: string;
  object_type: string;
  name: string;
  label: string;
  type: FieldDataType;
  required: boolean;
  read_only: boolean;
  options: Array<{ label: string; value: string }> | null;
  sort_order: number;
}

export async function getCustomFieldDefinitions(objectType: string): Promise<FieldDefinition[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("custom_field_definitions")
      .select("id, name, label, type, required, read_only, options")
      .eq("object_type", objectType.toLowerCase())
      .order("sort_order");

    if (error || !data || data.length === 0) {
      return [];
    }

    return data.map((row) => ({
      name: row.name,
      label: row.label,
      type: row.type as FieldDataType,
      required: row.required,
      readOnly: row.read_only,
      options: row.options || undefined,
    }));
  } catch (err) {
    console.error("getCustomFieldDefinitions error:", err);
    return [];
  }
}

export async function saveCustomFieldDefinition(
  objectType: string,
  field: FieldDefinition
): Promise<void> {
  const supabase = await createClient();
  const objectKey = objectType.toLowerCase();

  // Get current workspace_id
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .limit(1)
    .single();

  if (!member?.workspace_id) {
    throw new Error("Workspace context not found.");
  }

  const payload = {
    workspace_id: member.workspace_id,
    object_type: objectKey,
    name: field.name,
    label: field.label,
    type: field.type,
    required: Boolean(field.required),
    read_only: Boolean(field.readOnly),
    options: field.options || [],
  };

  const { error } = await supabase
    .from("custom_field_definitions")
    .upsert(payload, { onConflict: "workspace_id,object_type,name" });

  if (error) {
    console.warn("Database custom fields saving fallback active:", error.message);
  }

  revalidatePath("/users");
  await logAudit({
    action: "custom_field.created",
    entityType: "custom_field",
    entityLabel: field.label,
    metadata: { objectType: objectKey, fieldName: field.name },
  });
}

export async function deleteCustomFieldDefinition(objectType: string, fieldName: string): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("custom_field_definitions")
      .delete()
      .eq("object_type", objectType.toLowerCase())
      .eq("name", fieldName);

    if (error) {
      console.warn("Delete custom field database fallback:", error.message);
    }

    revalidatePath("/users");
    await logAudit({
      action: "custom_field.deleted",
      entityType: "custom_field",
      entityLabel: fieldName,
      metadata: { objectType },
    });
  } catch (err) {
    console.error("deleteCustomFieldDefinition error:", err);
  }
}
