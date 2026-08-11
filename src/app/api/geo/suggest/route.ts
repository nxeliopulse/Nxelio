import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type")?.trim();
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const state = request.nextUrl.searchParams.get("state")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Construct search query to get high-quality suggestions
  let searchQuery = q;
  if (type === "state" && country) {
    searchQuery = `${q}, ${country}`;
  } else if (type === "city") {
    if (state && country) {
      searchQuery = `${q}, ${state}, ${country}`;
    } else if (country) {
      searchQuery = `${q}, ${country}`;
    } else if (state) {
      searchQuery = `${q}, ${state}`;
    }
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=12&q=${encodeURIComponent(searchQuery)}`;
  
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Nxelio/1.0 (https://www.nxelio.ai)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return NextResponse.json({ results: [] });
    
    const data = await res.json();
    const suggestionsSet = new Set<string>();

    for (const item of data) {
      const address = item.address;
      if (!address) continue;

      if (type === "country") {
        if (address.country) suggestionsSet.add(address.country);
      } else if (type === "state") {
        const stateVal = address.state || address.province || address.region || address.county;
        if (stateVal) suggestionsSet.add(stateVal);
      } else if (type === "city") {
        const cityVal = address.city || address.town || address.village || address.municipality || address.suburb;
        if (cityVal) suggestionsSet.add(cityVal);
      }
    }

    const results = Array.from(suggestionsSet).slice(0, 10);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ results: [] });
  }
}
