import { getCountries, type CountryCode } from "libphonenumber-js";

const DISPLAY_NAMES = typeof Intl !== "undefined" && "DisplayNames" in Intl
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

// A few common aliases/abbreviations that don't exactly match Intl.DisplayNames'
// output (e.g. "USA" vs "United States") — real values seen in this app's data.
const ALIASES: Record<string, CountryCode> = {
  usa: "US",
  "u.s.a.": "US",
  "u.s.": "US",
  america: "US",
  uk: "GB",
  "u.k.": "GB",
  "great britain": "GB",
  uae: "AE",
};

let cachedNameToCode: Map<string, CountryCode> | null = null;
function nameToCodeMap(): Map<string, CountryCode> {
  if (cachedNameToCode) return cachedNameToCode;
  const map = new Map<string, CountryCode>();
  for (const code of getCountries()) {
    const name = DISPLAY_NAMES?.of(code);
    if (name) map.set(name.toLowerCase(), code);
  }
  cachedNameToCode = map;
  return map;
}

/** Resolves a free-text country name (as stored on leads/accounts/contacts,
 *  e.g. "United States", "USA", "uk") to its ISO 3166-1 alpha-2 code — the
 *  reliable, font-independent key flag images are addressed by. Returns null
 *  when nothing matches rather than guessing. */
export function countryCodeFromName(name: string | null | undefined): CountryCode | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (!key) return null;
  return nameToCodeMap().get(key) ?? ALIASES[key] ?? null;
}
