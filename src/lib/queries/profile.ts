"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isValidPhoneNumber } from "libphonenumber-js";

export async function updateProfile(payload: { full_name?: string; phone?: string; job_title?: string; avatar_url?: string }) {
  // The client always sends phone pre-formatted to international form (e.g.
  // "+1 555 123 4567") via formatPhoneForStorage() — never trust it alone.
  if (payload.phone && !isValidPhoneNumber(payload.phone)) {
    throw new Error("Phone number isn't valid.");
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("users").update(payload).eq("user_id", user.id);
  if (error) throw error;
  revalidatePath("/settings");
  revalidatePath("/onboarding");
  revalidatePath("/(app)", "layout");
}

export async function updatePassword(newPassword: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
