"use client";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

// Comprehensive list of countries for instant autocomplete
const COUNTRIES_LIST = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia",
  "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica",
  "Croatia", "Cuba", "Cyprus", "Czechia", "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador",
  "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau",
  "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland",
  "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait",
  "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico",
  "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru",
  "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman",
  "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe",
  "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia",
  "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
  "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan",
  "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Venezuela",
  "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type: "city" | "state" | "country";
  className?: string;
  countryContext?: string;
  stateContext?: string;
}

export function LocationAutocomplete({
  value,
  onChange,
  placeholder,
  type,
  className = "",
  countryContext = "",
  stateContext = "",
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync state with parent value updates
  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleInputChange(val: string) {
    setInputValue(val);
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (type === "country") {
      if (val.trim().length < 1) {
        setSuggestions(COUNTRIES_LIST.slice(0, 10));
        setOpen(true);
        return;
      }
      const filtered = COUNTRIES_LIST.filter((c) =>
        c.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 10);
      setSuggestions(filtered);
      setOpen(filtered.length > 0);
    } else {
      if (val.trim().length < 2) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        try {
          const url = `/api/geo/suggest?type=${type}&q=${encodeURIComponent(val)}&country=${encodeURIComponent(countryContext)}&state=${encodeURIComponent(stateContext)}`;
          const res = await fetch(url);
          const data = await res.json();
          const results = data.results || [];
          setSuggestions(results);
          setOpen(results.length > 0);
        } catch {
          setSuggestions([]);
        }
      }, 350);
    }
  }

  function handleFocus() {
    if (type === "country") {
      const currentList = inputValue
        ? COUNTRIES_LIST.filter((c) => c.toLowerCase().includes(inputValue.toLowerCase())).slice(0, 10)
        : COUNTRIES_LIST.slice(0, 10);
      setSuggestions(currentList);
      setOpen(currentList.length > 0);
    } else if (suggestions.length > 0) {
      setOpen(true);
    }
  }

  function selectOption(opt: string) {
    setInputValue(opt);
    onChange(opt);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      <Input
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={handleFocus}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg max-h-52 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => selectOption(s)}
              className="block w-full text-left px-3.5 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition truncate"
              title={s}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
