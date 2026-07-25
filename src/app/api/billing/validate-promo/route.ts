/**
 * POST /api/billing/validate-promo
 * Read-only preview — used for inline "Apply" feedback on the pricing page
 * and plan-picker, before the real checkout call. Never writes a
 * promotion_redemptions row (see previewPromoCode).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { previewPromoCode } from "@/lib/queries/promotions";
import type { PlanId } from "@/lib/queries/subscriptions";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code, planId } = (await req.json()) as { code: string; planId: PlanId };
  if (!code?.trim()) return NextResponse.json({ ok: false, error: "Enter a code" });

  const result = await previewPromoCode(code, planId);
  return NextResponse.json(result);
}
