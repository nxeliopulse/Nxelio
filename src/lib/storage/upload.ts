"use server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const BUCKET = "newsletter-images";
const AVATAR_BUCKET = "avatars";

/**
 * Uploads an image to the newsletter-images bucket and returns its public URL.
 * Accepts a FormData with field "file".
 */
export async function uploadNewsletterImage(formData: FormData): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const file = formData.get("file") as File | null;
    if (!file) return { ok: false, error: "No file provided" };
    if (file.size > 5 * 1024 * 1024) return { ok: false, error: "File too large (max 5MB)" };

    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      return { ok: false, error: "Unsupported file type. Use PNG, JPG, GIF, or WebP." };
    }

    const admin = createAdminClient();

    // Generate a unique filename
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const filename = `nl-${Math.random().toString(36).slice(2, 10)}-${Date.now()}.${ext}`;
    const path = `uploads/${filename}`;

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const { data: publicUrl } = admin.storage.from(BUCKET).getPublicUrl(path);
    return { ok: true, url: publicUrl.publicUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed" };
  }
}

/**
 * Uploads a profile avatar to the avatars bucket and returns its public URL.
 * Accepts a FormData with field "file". Path is keyed by the current user's
 * id so uploads are stable and identifiable, unlike uploadNewsletterImage's
 * random filename (which doesn't need to be looked up by owner).
 */
export async function uploadAvatarImage(formData: FormData): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated" };

    const file = formData.get("file") as File | null;
    if (!file) return { ok: false, error: "No file provided" };
    if (file.size > 2 * 1024 * 1024) return { ok: false, error: "File too large (max 2MB)" };

    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      return { ok: false, error: "Unsupported file type. Use PNG, JPG, GIF, or WebP." };
    }

    const admin = createAdminClient();

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    // no Date.now()-only path — mixed with the user id so re-uploads don't collide
    // and old avatars for the same user are naturally superseded on next fetch.
    const path = `${user.id}-${Date.now()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const { error } = await admin.storage.from(AVATAR_BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const { data: publicUrl } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    return { ok: true, url: publicUrl.publicUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed" };
  }
}
