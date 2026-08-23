import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdmin } from "@/lib/queries/platform-admin";
import { adminCancelSubscription } from "@/lib/queries/cancellation-requests";

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const workspaceId = body.workspaceId as string | undefined;
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  const result = await adminCancelSubscription(
    workspaceId,
    (body.cancellationRequestId as string | undefined) || undefined
  );

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
