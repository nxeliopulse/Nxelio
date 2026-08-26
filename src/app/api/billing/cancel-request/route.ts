import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitCancellationRequest } from "@/lib/queries/cancellation-requests";
import type { CancellationReason } from "@/lib/queries/cancellation-types";

const VALID_REASONS = new Set<CancellationReason>([
  "too_expensive", "missing_features", "found_alternative",
  "not_using", "technical_issues", "business_closed", "other",
]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const reason = body.reason as CancellationReason | undefined;
  if (!reason || !VALID_REASONS.has(reason)) {
    return NextResponse.json({ error: "A cancellation reason is required." }, { status: 400 });
  }

  const customerEmail = (body.customerEmail as string | undefined)?.trim().toLowerCase() || user.email;
  if (!customerEmail) return NextResponse.json({ error: "Customer email is required." }, { status: 400 });

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const customerName =
    (body.customerName as string | undefined)?.trim() ||
    (meta?.full_name as string | undefined) ||
    (meta?.name as string | undefined) ||
    user.email?.split("@")[0] ||
    undefined;

  const result = await submitCancellationRequest({
    customerName,
    customerEmail,
    planId: (body.planId as string | undefined) || undefined,
    reason,
    feedback: (body.feedback as string | undefined)?.trim().slice(0, 1000) || undefined,
    wantsMeeting: Boolean(body.wantsMeeting),
    meetingProvider: body.meetingProvider === "google_meet" ? "google_meet" : body.wantsMeeting ? "zoom" : undefined,
    preferredDate: (body.preferredDate as string | undefined) || undefined,
    preferredTime: (body.preferredTime as string | undefined) || undefined,
  });

  // Honour the status the query layer chose (409 duplicate, 400 no-subscription,
  // 401 signed-out); only a genuine failure falls through to 500.
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ ok: true, ticketId: result.ticketId });
}
