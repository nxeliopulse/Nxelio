import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness target for Kubernetes. Deliberately does no auth, no DB
 * call and no rendering: probes must stay fast and keep answering while the
 * pod is saturated, otherwise the load balancer evicts healthy pods mid-test.
 */
export function GET() {
  return NextResponse.json({ ok: true });
}
