"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface NotificationRow {
  id: string;
  user_id: string | null;
  type: string | null;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export async function getNotifications(): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  return (data as NotificationRow[]) || [];
}

export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);
  return count ?? 0;
}

export async function markNotificationRead(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/", "layout");
}

export async function markAllRead() {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("is_read", false);
  if (error) throw error;
  revalidatePath("/", "layout");
}

/**
 * Creates a notification for the currently logged-in user.
 * Used by other server actions when events happen (campaign sent,
 * newsletter sent, workflow run, etc.).
 */
export async function notifyCurrentUser(payload: {
  type: string;
  title: string;
  message?: string;
  link?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  // Use admin so the user_id INSERT bypasses RLS gymnastics
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();
  await admin.from("notifications").insert({
    user_id: user.id,
    workspace_id: profile?.workspace_id,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    link: payload.link,
  });
  revalidatePath("/", "layout");
}

/**
 * Notifies all admins in the workspace (used for hot lead alerts, errors, etc.)
 */
export async function notifyWorkspaceAdmins(workspaceId: string, payload: {
  type: string;
  title: string;
  message?: string;
  link?: string;
}) {
  const admin = createAdminClient();
  const { data: admins } = await admin
    .from("users")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("role_id", 1);
  if (!admins?.length) return;
  await admin.from("notifications").insert(
    admins.map((a: { user_id: string }) => ({
      user_id: a.user_id,
      workspace_id: workspaceId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link,
    }))
  );
  revalidatePath("/", "layout");
}
