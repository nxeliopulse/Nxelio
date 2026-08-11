"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Multi-location picker for Buy Leads — chips for each picked location, backed
 * by the same debounced Nominatim search-as-you-type used elsewhere (see
 * /api/geo/search). Locations can only be added by picking a suggestion, never
 * typed as a free-text address, so every stored value is a real place name.
 */
export function MultiLocationInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(v)}`);
        const data = await res.json();
        const results: string[] = (data.results || []).filter((s: string) => !value.includes(s));
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 350);
  }

  function addLocation(loc: string) {
    if (!value.includes(loc)) onChange([...value, loc]);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
  }

  function removeLocation(loc: string) {
    onChange(value.filter((v) => v !== loc));
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-400 bg-white px-3 py-2 min-h-12 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 shadow-sm">
        {value.map((loc) => (
          <span key={loc} className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 text-base font-medium pl-3 pr-1.5 py-1">
            {loc}
            <button type="button" onClick={() => removeLocation(loc)} aria-label={`Remove ${loc}`} className="p-0.5 rounded-full hover:bg-blue-100 text-blue-500">
              <X className="h-4 w-4" />
            </button>
          </span>
        ))}
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (suggestions.length) setOpen(true); }}
          placeholder={value.length ? "Add another location" : "e.g. United States, Austin TX"}
          autoComplete="off"
          className="flex-1 min-w-[140px] border-0 shadow-none focus:ring-0 px-1 py-1 h-auto text-base"
        />
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-56 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addLocation(s)}
              className="block w-full text-left px-3 py-2 text-base text-slate-700 hover:bg-slate-50 truncate"
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
