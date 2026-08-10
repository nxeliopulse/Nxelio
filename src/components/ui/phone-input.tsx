"use client";
import { useMemo } from "react";
import { getCountries, getCountryCallingCode, isValidPhoneNumber, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

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

/** Formats into a consistent international string for storage, e.g. "+1 555 123 4567". Returns the raw input if it doesn't parse. */
export function formatPhoneForStorage(value: string, country: CountryCode): string {
  if (!value.trim()) return "";
  const parsed = parsePhoneNumberFromString(value, country);
  return parsed ? parsed.formatInternational() : value.trim();
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

/** Country-code select + phone number field, validated per-country via libphonenumber-js. */
export function PhoneInput({ label, country, value, onCountryChange, onValueChange, required, inputClassName }: PhoneInputProps) {
  const countries = useMemo(countryList, []);
  const valid = isPhoneValid(value, country);

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-500 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="flex gap-1.5">
        <select
          value={country}
          onChange={(e) => onCountryChange(e.target.value as CountryCode)}
          className="w-[92px] shrink-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white px-1.5 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-400"
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>+{c.callingCode} {c.code}</option>
          ))}
        </select>
        <input
          type="tel"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="Phone number"
          className={inputClassName ?? "flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400"}
          aria-invalid={!valid}
        />
      </div>
      {!valid && <p className="text-[11px] text-red-500 mt-1">Not a valid phone number for the selected country.</p>}
    </div>
  );
}
