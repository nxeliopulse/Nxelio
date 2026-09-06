import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/ai/security";

interface NominatimResult {
  display_name: string;
  address?: {
    city?: string; town?: string; village?: string; municipality?: string; hamlet?: string;
    state?: string; province?: string; region?: string;
    country?: string;
  };
}

/** Nominatim's display_name is a raw address line — county, postcode and all
 *  (e.g. "Austin, Travis County, Texas, 78701, United States"). Buy Leads
 *  only ever wants a plain "City, State, Country" (or just state/country for
 *  a broader pick), so build that from addressdetails' structured fields
 *  instead of showing the noisy full string. */
function cleanLabel(item: NominatimResult): string | null {
  const a = item.address;
  if (!a) return null;
  const place = a.city || a.town || a.village || a.municipality || a.hamlet;
  const state = a.state || a.province || a.region;
  const country = a.country;
  const parts = [place, state, country].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(", ") : null;
}

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

  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Nxelio/1.0 (https://www.nxelio.ai)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return NextResponse.json({ results: [] });
    const data = (await res.json()) as NominatimResult[];
    // De-dupe — several raw results (e.g. a city and its county) often clean
    // down to the same label.
    const seen = new Set<string>();
    const results: string[] = [];
    for (const item of data) {
      const label = cleanLabel(item);
      if (label && !seen.has(label)) { seen.add(label); results.push(label); }
      if (results.length >= 6) break;
    }
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
