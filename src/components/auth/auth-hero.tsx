"use client";
import { useEffect, useState } from "react";
import { Sparkles, Quote } from "lucide-react";
import { Logo } from "@/components/brand/logo";

const TESTIMONIALS = [
  {
    quote:
      "Nxelio writes better follow-ups than half my SDR team — and it never forgets to send them. Our reply rate doubled in six weeks.",
    name: "Sarah Chen",
    role: "VP of Sales, Northwind",
    avatar: "SC",
  },
  {
    quote:
      "We replaced three tools with Nxelio. Lead scoring, sequences, and reporting all live in one place now. The AI just gets it.",
    name: "Marcus Reyes",
    role: "Founder, Loophole Labs",
    avatar: "MR",
  },
  {
    quote:
      "It feels like having a revenue analyst on call 24/7. I open the dashboard and instantly know which deals need me today.",
    name: "Priya Nair",
    role: "Head of Growth, Cadence",
    avatar: "PN",
  },
];

const STATS = [
  { value: "2.4×", label: "Higher reply rate" },
  { value: "18hrs", label: "Saved per rep / week" },
  { value: "94%", label: "Forecast accuracy" },
];

export function AuthHero() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % TESTIMONIALS.length), 5000);
    return () => clearInterval(t);
  }, []);

  const t = TESTIMONIALS[idx];

  return (
    <div className="hidden lg:flex relative bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 text-white p-12 xl:p-16 flex-col justify-between overflow-hidden">
      {/* Floating gradient blobs */}
      <div className="absolute inset-0 opacity-50 pointer-events-none">
        <div className="absolute top-10 -left-24 w-96 h-96 bg-blue-500 rounded-full blur-3xl animate-blob-1" />
        <div className="absolute bottom-10 -right-24 w-96 h-96 bg-indigo-500 rounded-full blur-3xl animate-blob-2" />
        <div className="absolute top-1/2 left-1/3 w-72 h-72 bg-purple-500/50 rounded-full blur-3xl animate-blob-3" />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Top: logo */}
      <div className="relative animate-fade-up">
        <Logo className="[&_span:first-child]:text-white [&_span:last-child]:text-blue-200" />
      </div>

      {/* Middle: rotating testimonial */}
      <div className="relative max-w-lg">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-xs font-medium text-blue-100 mb-8 animate-fade-up">
          <Sparkles className="h-3 w-3" /> Trusted by 4,000+ revenue teams
        </div>

        <Quote className="h-10 w-10 text-blue-300/40 mb-5" />

        <blockquote key={idx} className="animate-fade-up">
          <p className="text-2xl xl:text-[1.7rem] font-semibold leading-snug text-white/95">
            “{t.quote}”
          </p>
          <footer className="mt-7 flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center font-semibold text-white ring-2 ring-white/20 flex-shrink-0">
              {t.avatar}
            </div>
            <div>
              <p className="font-semibold text-white">{t.name}</p>
              <p className="text-sm text-blue-200/70">{t.role}</p>
            </div>
          </footer>
        </blockquote>

        {/* Dots */}
        <div className="flex items-center gap-2 mt-8">
          {TESTIMONIALS.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Show testimonial ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? "w-8 bg-white" : "w-1.5 bg-white/30 hover:bg-white/50"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Bottom: stat strip */}
      <div className="relative animate-fade-up" style={{ animationDelay: "0.3s" }}>
        <div className="grid grid-cols-3 gap-6 pt-8 border-t border-white/10">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-2xl xl:text-3xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-blue-200/60 mt-1 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
