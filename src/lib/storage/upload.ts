"use server";
import { createAdminClient } from "@/lib/supabase/server";

const BUCKET = "newsletter-images";

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
