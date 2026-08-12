"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { getCountries, getCountryCallingCode, getExampleNumber, isValidPhoneNumber, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import examples from "libphonenumber-js/examples.mobile.json";
import { cn } from "@/lib/utils";
import { CountryFlag } from "@/components/ui/country-flag";

export type { CountryCode };

const COUNTRY_NAMES = typeof Intl !== "undefined" && "DisplayNames" in Intl
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

interface CountryOption {
  code: CountryCode;
  name: string;
  callingCode: string;
}

let cachedCountryList: CountryOption[] | null = null;
function countryList(): CountryOption[] {
  if (cachedCountryList) return cachedCountryList;
  cachedCountryList = getCountries()
    .map((code) => ({ code, name: COUNTRY_NAMES?.of(code) ?? code, callingCode: getCountryCallingCode(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return cachedCountryList;
}

/** Best-effort country to preselect from an existing stored number (e.g. "+1 555-123-4567"). Falls back to "US". */
export function detectCountry(existingValue: string | null | undefined): CountryCode {
  const parsed = existingValue ? parsePhoneNumberFromString(existingValue) : undefined;
  return parsed?.country ?? "US";
}

/** True if empty (fields are optional) or a valid number for the given country. */
export function isPhoneValid(value: string, country: CountryCode): boolean {
  return !value.trim() || isValidPhoneNumber(value, country);
}

/** Formats into a consistent international string for storage, e.g. "+1 555 123 4567" —
 *  always prefixed with the selected country's calling code, even when the digits
 *  typed don't form a strictly-valid number for that country (libphonenumber's
 *  parser returns null for those, which previously meant the country code got
 *  silently dropped and only the bare local digits were stored). */
export function formatPhoneForStorage(value: string, country: CountryCode): string {
  const raw = value.trim();
  if (!raw) return "";
  const parsed = parsePhoneNumberFromString(raw, country);
  if (parsed) return parsed.formatInternational();
  // Already has its own "+countrycode" — leave as typed rather than double-prefixing.
  if (raw.startsWith("+")) return raw;
  return `+${getCountryCallingCode(country)} ${raw}`;
}

const examplePlaceholderCache = new Map<CountryCode, string>();
/** A real example number for the selected country (e.g. "(201) 555-0123" for US),
 *  shown as the input's placeholder so it's obvious what format is expected. */
function examplePlaceholder(country: CountryCode): string {
  const cached = examplePlaceholderCache.get(country);
  if (cached !== undefined) return cached;
  const example = getExampleNumber(country, examples);
  const placeholder = example ? example.formatNational() : "Phone number";
  examplePlaceholderCache.set(country, placeholder);
  return placeholder;
}

/** Flag button + searchable country list, opened as a floating panel — the calling-code
 *  equivalent of a native <select> but with flags and search, since a plain <select>
 *  can't render a flag glyph next to each option. */
function CountryDropdown({ country, onChange }: { country: CountryCode; onChange: (c: CountryCode) => void }) {
  const countries = useMemo(() => countryList(), []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  function toggleOpen() {
    setOpen((v) => {
      const next = !v;
      if (next) { setQuery(""); requestAnimationFrame(() => searchRef.current?.focus()); }
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => c.name.toLowerCase().includes(q) || c.callingCode.includes(q) || c.code.toLowerCase().includes(q));
  }, [countries, query]);

  const current = countries.find((c) => c.code === country);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={toggleOpen}
        className="flex items-center gap-1 h-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400"
      >
        <CountryFlag code={current?.code} className="h-3.5 w-5" />
        <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-800">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or code…"
              className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 dark:text-white px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-400 text-center">No matches</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => { onChange(c.code); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800",
                    c.code === country && "bg-blue-50 dark:bg-blue-950/40"
                  )}
                >
                  <CountryFlag code={c.code} />
                  <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{c.name}</span>
                  <span className="text-slate-400 tabular-nums">+{c.callingCode}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface PhoneInputProps {
  label: string;
  country: CountryCode;
  value: string;
  onCountryChange: (country: CountryCode) => void;
  onValueChange: (value: string) => void;
  required?: boolean;
  inputClassName?: string;
}

/** Flag-dropdown country selector + phone number field, validated per-country via libphonenumber-js. */
export function PhoneInput({ label, country, value, onCountryChange, onValueChange, required, inputClassName }: PhoneInputProps) {
  const valid = isPhoneValid(value, country);

  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-500 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="flex gap-1.5">
        <CountryDropdown country={country} onChange={onCountryChange} />
        <input
          type="tel"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={examplePlaceholder(country)}
          className={inputClassName ?? "flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400"}
          aria-invalid={!valid}
        />
      </div>
      {!valid && <p className="text-[11px] text-red-500 mt-1">Not a valid phone number for the selected country.</p>}
    </div>
  );
}
