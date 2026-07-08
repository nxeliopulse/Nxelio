"use client";
import { useEffect, useState } from "react";
import { Sparkles, Zap, MessageSquare, BarChart3 } from "lucide-react";
import { Logo } from "@/components/brand/logo";

const ROTATING_WORDS = ["Score", "Engage", "Nurture", "Convert"];

const PILLARS = [
  { icon: Sparkles, text: "AI that reads, scores, and writes — for every lead" },
  { icon: Zap, text: "Drag-and-drop workflows that run 24/7" },
  { icon: MessageSquare, text: "Personalized campaigns that don't feel automated" },
  { icon: BarChart3, text: "See ROI in real time — every email, every reply" },
];

export function AuthHero() {
  const [wordIdx, setWordIdx] = useState(0);
  const [tick, setTick] = useState(0);

  // Rotate the headline word every 2.4s
  useEffect(() => {
    const t = setInterval(() => {
      setWordIdx((i) => (i + 1) % ROTATING_WORDS.length);
      setTick((n) => n + 1);
    }, 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="hidden lg:flex relative bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white p-12 flex-col justify-between overflow-hidden">
      {/* Floating gradient blobs */}
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute top-20 -left-20 w-96 h-96 bg-blue-500 rounded-full blur-3xl animate-blob-1" />
        <div className="absolute bottom-20 -right-20 w-96 h-96 bg-indigo-500 rounded-full blur-3xl animate-blob-2" />
        <div className="absolute top-1/2 left-1/3 w-72 h-72 bg-purple-500/60 rounded-full blur-3xl animate-blob-3" />
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

      {/* Middle: headline + pillars */}
      <div className="relative space-y-10">
        <div>
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-xs font-medium text-blue-100 mb-5 animate-fade-up" style={{ animationDelay: "0.05s" }}>
            <Sparkles className="h-3 w-3" /> AI Sales Operating System
          </div>

          {/* Headline with rotating word */}
          <h2 className="text-5xl font-bold leading-tight mb-5 animate-fade-up" style={{ animationDelay: "0.15s" }}>
            <span className="block text-white">Stop chasing leads.</span>
            <span className="block">
              <span className="text-white/90">Let AI </span>
              <span key={tick} className="inline-block animate-word bg-shimmer">
                {ROTATING_WORDS[wordIdx]}
              </span>
              <span className="text-white/90"> them.</span>
            </span>
          </h2>

          <p className="text-blue-100/80 text-lg leading-relaxed max-w-md animate-fade-up" style={{ animationDelay: "0.3s" }}>
            LeadPro scores every prospect, writes every email, and runs every follow-up — so your team focuses on closing, not typing.
          </p>
        </div>

        {/* Pillars (stagger-animated) */}
        <div className="space-y-3 max-w-md stagger">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.text}
                className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/5 backdrop-blur-sm hover:bg-white/[0.08] hover:border-white/10 transition-all"
              >
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500/30 to-indigo-500/30 ring-1 ring-blue-300/20 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-4 w-4 text-blue-200" />
                </div>
                <span className="text-blue-50/95 text-sm leading-relaxed pt-1">{p.text}</span>
              </div>
            );
          })}
        </div>

        {/* Floating live stat card */}
        <div className="relative max-w-xs animate-float-gentle" style={{ animationDelay: "0.6s" }}>
          <div className="relative p-4 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md border border-white/10 shadow-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 animate-pulse-ring" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-xs font-semibold text-emerald-300">Live now</span>
            </div>
            <p className="text-sm font-semibold text-white leading-snug">
              247 emails sent automatically in the last hour
            </p>
            <p className="text-xs text-blue-200/70 mt-1">Across 12 active campaigns • 42 replies</p>
          </div>
        </div>
      </div>

      {/* Bottom: footer */}
      <div className="relative text-sm text-blue-200/60 animate-fade-up" style={{ animationDelay: "0.75s" }}>
        <div className="flex items-center justify-between">
          <span>© 2026 LeadPro</span>
          <span className="flex items-center gap-1.5 text-blue-200/40">
            <span className="h-1 w-1 rounded-full bg-emerald-400 inline-block" />
            All systems normal
          </span>
        </div>
      </div>
    </div>
  );
}
