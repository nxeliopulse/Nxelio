"use server";
import { createAdminClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/queries/platform-admin";
import { stripe } from "@/lib/stripe";

const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I — avoids transcription mistakes

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 10; i++) code += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  return code;
}

export interface EmailPromoCodeRow {
  id: string;
  code: string;
  restricted_email: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  is_active: boolean;
  times_redeemed: number;
  max_redemptions: number | null;
  valid_until: string | null;
  created_at: string;
  description: string | null;
  status: "unused" | "redeemed" | "expired" | "revoked";
}

export interface CreateEmailPromoCodeInput {
  email: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  expiresAt: string; // ISO date string, required — "expiry date should be configurable"
  note?: string;
}

export interface CreateEmailPromoCodeResult {
  ok: boolean;
  code?: string;
  error?: string;
}

/**
 * Generates a brand-new, one-time-use promo code good for exactly one email
 * address. Creates a matching Stripe Coupon so the discount actually applies
 * at checkout (see discounts handling in /api/billing/checkout) — the code
 * string itself and its email/expiry/one-time-use restrictions are enforced
 * entirely on our side (redeem_promotion_start), independent of Stripe.
 */
export async function createEmailPromoCode(input: CreateEmailPromoCodeInput): Promise<CreateEmailPromoCodeResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "Enter a valid email address" };
  if (!input.discountValue || input.discountValue <= 0) return { ok: false, error: "Enter a discount value greater than 0" };
  if (input.discountType === "percentage" && input.discountValue > 100) return { ok: false, error: "Percentage discount can't exceed 100" };
  const expiresAt = new Date(input.expiresAt);
  if (isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "Expiry date must be in the future" };
  }

  try {
    const coupon = await stripe().coupons.create({
      duration: "once",
      ...(input.discountType === "percentage"
        ? { percent_off: input.discountValue }
        : { amount_off: Math.round(input.discountValue * 100), currency: "usd" }),
      name: `One-time code for ${email}`,
    });

    const admin = createAdminClient();
    let code = generateCode();
    // Practically never collides at 10 chars from a 33-char set, but guard anyway.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: existing } = await admin.from("promotions").select("id").eq("code", code).maybeSingle();
      if (!existing) break;
      code = generateCode();
    }

    const { error } = await admin.from("promotions").insert({
      code,
      description: input.note?.trim() || `One-time promo for ${email}`,
      category: "general",
      discount_type: input.discountType,
      discount_value: input.discountValue,
      stripe_coupon_id: coupon.id,
      restricted_email: email,
      max_redemptions: 1,
      valid_until: expiresAt.toISOString(),
      is_active: true,
    });
    if (error) return { ok: false, error: error.message };

    return { ok: true, code };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't create the promo code." };
  }
}

/** Every email-restricted code ever created, newest first — for the admin list view. */
export async function getEmailPromoCodes(): Promise<EmailPromoCodeRow[]> {
  if (!(await isPlatformAdmin())) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("promotions")
    .select("id, code, restricted_email, discount_type, discount_value, is_active, times_redeemed, max_redemptions, valid_until, created_at, description")
    .not("restricted_email", "is", null)
    .order("created_at", { ascending: false });

  const now = Date.now();
  return ((data as Omit<EmailPromoCodeRow, "status">[] | null) ?? []).map((row) => {
    let status: EmailPromoCodeRow["status"] = "unused";
    if (!row.is_active) status = "revoked";
    else if (row.times_redeemed > 0) status = "redeemed";
    else if (row.valid_until && new Date(row.valid_until).getTime() < now) status = "expired";
    return { ...row, restricted_email: row.restricted_email as string, status };
  });
}

/** Deactivates a code before it's used — doesn't affect a code that's already been redeemed. */
export async function revokeEmailPromoCode(promotionId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "Forbidden" };
  const admin = createAdminClient();
  const { error } = await admin.from("promotions").update({ is_active: false }).eq("id", promotionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
