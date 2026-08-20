import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/ai/security";

/**
 * Proxies location search to OpenStreetMap's Nominatim geocoder for the Buy
 * Leads location autocomplete. Proxied server-side because Nominatim requires
 * a real identifying User-Agent (browsers can't set that header) and to keep
 * us within their ~1 req/sec usage policy regardless of client behavior.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  // Enforced with one fixed key (not per-caller) — Nominatim's ~1 req/sec
  // limit applies to this whole app, not to each individual user.
  if (!rateLimit("nominatim", "geoLookup").allowed) return NextResponse.json({ results: [] });

  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=6&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Nxelio/1.0 (https://www.nxelio.ai)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return NextResponse.json({ results: [] });
    const data = (await res.json()) as Array<{ display_name: string }>;
    const results = data.map((r) => r.display_name).slice(0, 6);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
