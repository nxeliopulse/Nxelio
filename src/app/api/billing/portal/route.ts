/**
 * POST /api/billing/portal
 * Creates a Chargebee self-service portal session and returns the portal URL.
 * Users can update payment methods, view invoices, and cancel from here.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chargebee } from "@/lib/chargebee";

export async function POST(_req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("chargebee_customer_id")
    .single();

  if (!sub?.chargebee_customer_id) {
    return NextResponse.json(
      { error: "No billing account found. Please subscribe to a plan first." },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const result = await chargebee()
      .portal_session.create({
        customer: { id: sub.chargebee_customer_id },
        redirect_url: `${appUrl}/billing`,
      })
      .request();

    return NextResponse.json({ url: result.portal_session.access_url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing/portal]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
