/**
 * POST /api/billing/lead-topup
 * Charges the workspace's card on file for a $149 / 1,000-lead top-up and
 * instantly grants the leads. Works on any plan, no subscription change,
 * repeatable — the actual charge + credit-grant logic lives in
 * purchaseLeadTopUp() (src/lib/queries/lead-topups.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { purchaseLeadTopUp } from "@/lib/queries/lead-topups";

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await purchaseLeadTopUp();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(result);
}
