"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
interface DropdownCoords {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxListHeight: number;
}

function CountryDropdown({ country, onChange }: { country: CountryCode; onChange: (c: CountryCode) => void }) {
  const countries = useMemo(() => countryList(), []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<DropdownCoords | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Positioned via a portal (fixed coords from the trigger's own bounding
  // rect) rather than absolute-inside-rootRef — this field usually sits in a
  // scrollable form column, and an absolutely positioned panel gets clipped
  // by that ancestor's overflow, which is what made the list look cut off /
  // overlapping instead of floating cleanly above the rest of the page.
  function updateCoords() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow;
    setCoords({
      left: rect.left,
      width: Math.max(rect.width, 256),
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 4, maxListHeight: Math.max(120, Math.min(256, spaceAbove - 56)) }
        : { top: rect.bottom + 4, maxListHeight: Math.max(120, Math.min(256, spaceBelow - 56)) }),
    });
  }

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onReposition() { updateCoords(); }
    document.addEventListener("mousedown", onOutside);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open]);

  function toggleOpen() {
    setOpen((v) => {
      const next = !v;
      if (next) {
        setQuery("");
        updateCoords();
        requestAnimationFrame(() => searchRef.current?.focus());
      }
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
        className="flex items-center gap-1 h-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[var(--card)] px-2 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)]"
      >
        <CountryFlag code={current?.code} className="h-3.5 w-5" />
        <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>
      {open && coords && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[100] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[var(--card)] shadow-lg overflow-hidden"
          style={{ left: coords.left, width: coords.width, top: coords.top, bottom: coords.bottom }}
        >
          <div className="p-2 border-b border-slate-100 dark:border-slate-800">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or code…"
              className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[var(--muted)] dark:text-slate-900 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)]"
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: coords.maxListHeight }}>
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-400 text-center">No matches</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => { onChange(c.code); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-[var(--muted)]",
                    c.code === country && "bg-[var(--primary)]/10 dark:bg-[var(--primary)]/15"
                  )}
                >
                  <CountryFlag code={c.code} />
                  <span className="flex-1 truncate text-slate-700 dark:text-slate-600">{c.name}</span>
                  <span className="text-slate-400 tabular-nums">+{c.callingCode}</span>
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
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
          // Normalize to international form as soon as the user leaves the
          // field, not just whenever the parent form happens to submit — so a
          // consumer that persists on blur (rather than waiting for a Save
          // button) still stores a properly formatted value.
          onBlur={() => { if (value.trim()) onValueChange(formatPhoneForStorage(value, country)); }}
          placeholder={examplePlaceholder(country)}
          className={inputClassName ?? "flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[var(--card)] dark:text-slate-900 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)]"}
          aria-invalid={!valid}
        />
      </div>
      {!valid && <p className="text-[11px] text-red-500 mt-1">Not a valid phone number for the selected country.</p>}
    </div>
  );
}
