"use client";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

/** Debounced location search-as-you-type, backed by OpenStreetMap Nominatim (see /api/geo/search). */
export function LocationSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
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
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(v)}`);
        const data = await res.json();
        setSuggestions(data.results || []);
        setOpen((data.results || []).length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 350);
  }

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length) setOpen(true); }}
        placeholder="e.g. United States, Austin TX"
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-56 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { onChange(s); setOpen(false); }}
              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 truncate"
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
