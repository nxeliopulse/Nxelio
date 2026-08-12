import { Globe2 } from "lucide-react";
import { countryCodeFromName } from "@/lib/geo/country-code";
import { cn } from "@/lib/utils";

interface CountryFlagProps {
  /** Free-text country name as stored on the record, e.g. "United States". */
  country?: string | null;
  /** ISO 3166-1 alpha-2 code directly, when already known (skips the name lookup). */
  code?: string | null;
  className?: string;
}

/**
 * Renders a real flag image (flagcdn.com's SVGs) keyed by ISO country code —
 * NOT a Unicode flag emoji. Flag emoji (regional indicator character pairs)
 * render as an actual flag only on platforms whose system font ships colored
 * flag glyphs (macOS/iOS/most Android). Windows deliberately doesn't: it
 * renders the same two-letter code as plain text (exactly the "US" vs 🇺🇸
 * mismatch a Mac/Windows pair sees). An <img> looks identical everywhere.
 */
export function CountryFlag({ country, code, className }: CountryFlagProps) {
  const resolved = (code || countryCodeFromName(country))?.toLowerCase();
  if (!resolved) return <Globe2 className={cn("h-3.5 w-3.5 text-slate-400 inline-block", className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external flag CDN, not a static local asset
    <img
      src={`https://flagcdn.com/${resolved}.svg`}
      alt={country || resolved.toUpperCase()}
      title={country || resolved.toUpperCase()}
      loading="lazy"
      className={cn("inline-block h-3.5 w-5 rounded-[2px] object-cover align-middle", className)}
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
  );
}
