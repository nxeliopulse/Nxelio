"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Plus, ChevronDown, Users2, Layers3, Send, Workflow, FileText, Newspaper } from "lucide-react";

const items = [
  { label: "New lead", href: "/leads", icon: Users2 },
  { label: "New segment", href: "/segments/builder", icon: Layers3 },
  { label: "New campaign", href: "/campaigns/builder", icon: Send },
  { label: "New newsletter", href: "/newsletters/builder", icon: Newspaper },
  { label: "New workflow", href: "/workflows/builder", icon: Workflow },
  { label: "New template", href: "/templates", icon: FileText },
];

export function CreateMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="hidden md:inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Create
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden z-40">
          <div className="p-1">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Icon className="h-4 w-4 text-slate-400" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
