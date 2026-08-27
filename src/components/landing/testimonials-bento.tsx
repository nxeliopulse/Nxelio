"use client";

import { useState } from "react";
import {
  Star, Sparkles, Pause, Cpu, ShieldCheck, Database, RefreshCw,
  MessageSquare, LayoutList, Kanban, CalendarClock, FileSpreadsheet,
  Mail, Briefcase,
} from "lucide-react";

// Same card shapes as the original bento layout (dome arches, split photos,
// tall portraits, speech bubbles) — but every card states a real, verifiable
// fact instead of a fabricated customer. The original content here was
// template placeholder copy (literally watermarked "mockup and image not
// included" in its source) — fake names lifted from Wuthering Heights /
// Dorian Gray, stock photos, an invented "4.9/5.0 · 450+ teams" rating, and
// unfinished Lorem Ipsum ("Semper feugiat...") left inside a "real" quote.
// None of that ships here. Swap any card for a real customer testimonial
// (name, role, photo) the moment there's an actual one to use.
const FACTS = [
  { key: "ai", Icon: Cpu, tag: "AI Engine", heading: "Real AI, not a demo", body: "Prospecting, enrichment, and outreach copy are powered by OpenAI and Groq — every time you use it." },
  { key: "billing", Icon: ShieldCheck, tag: "Payments", heading: "Secure billing", body: "Payments are processed by Stripe, the same infrastructure trusted by millions of businesses." },
  { key: "data", Icon: Database, tag: "Security", heading: "Your data, protected", body: "Auth, storage, and database security are built on Supabase — audited, encrypted, industry-standard." },
  { key: "playbooks", Icon: LayoutList, tag: "Playbooks", heading: "Ready-made sequences", body: "Six pre-built playbooks — LinkedIn Cold Outreach, Cold Email Sequence, Warm Lead Nurture, and more." },
  { key: "pipeline", Icon: Kanban, tag: "Pipeline", heading: "A pipeline you can see", body: "Track every deal by stage, on every plan — not locked behind a higher tier." },
  { key: "meetings", Icon: CalendarClock, tag: "Scheduling", heading: "Booking, without the back-and-forth", body: "Share a link, sync Google or Microsoft/Outlook Calendar, get a real Zoom link automatically." },
  { key: "csv", Icon: FileSpreadsheet, tag: "CSV Import", heading: "Bring your own list", body: "Upload a CSV and enrich it with verified emails and phone numbers where available." },
  { key: "trial", Icon: RefreshCw, tag: "Free Trial", heading: "No lock-in", body: "Start with a 7-day free trial. Cancel, downgrade, or upgrade any time." },
];

export function TestimonialsBentoSection() {
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const F = (i: number) => FACTS[i % FACTS.length];

  return (
    <section id="testimonials" className="py-24 sm:py-32 bg-transparent relative overflow-hidden transition-colors">
      {/* Radiant ambient colorful glass light sources */}
      <div className="absolute -top-10 left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-blue-500/20 via-sky-400/15 to-transparent rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-1/2 right-10 w-[550px] h-[550px] bg-gradient-to-br from-indigo-500/20 via-purple-400/15 to-pink-300/10 rounded-full blur-[110px] pointer-events-none" />
      <div className="absolute -bottom-10 left-10 w-[450px] h-[450px] bg-gradient-to-tr from-teal-400/20 via-emerald-300/15 to-transparent rounded-full blur-[90px] pointer-events-none" />

      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        {/* Header section */}
        <div className="max-w-3xl mx-auto text-center mb-14 sm:mb-18">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/25 backdrop-blur-md border border-white/30 shadow-sm mb-4 text-xs font-semibold text-blue-100">
            <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300 animate-star-twinkle" />
            <span>Built To Be Trusted</span>
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight">
            We&apos;re early-stage, so here&apos;s <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-orange-200 to-cyan-200">
              what&apos;s actually true.
            </span>
          </h2>

          <p className="text-base sm:text-lg text-blue-50 mt-4 leading-relaxed max-w-2xl mx-auto font-medium">
            No customer reviews yet — so instead of faking some, here&apos;s exactly what Nxelio Nurture runs on.
          </p>
        </div>

        {/* Bento / Masonry Grid with Deep Curves */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7 sm:gap-8 items-start">

          {/* ================= COLUMN 1 ================= */}
          <div className="flex flex-col gap-7 sm:gap-8">

            {/* CARD 1: Speech Bubble with top-left Quote badge & top-right icon avatar */}
            <div className={`relative glossy-card rounded-[38px] p-7 sm:p-8 pt-9 hover-lift-card group mt-4 ${animationsEnabled ? "animate-float-1" : ""}`}>
              <div className="absolute -top-4 left-7 w-10 h-10 rounded-2xl bg-[#1f2223] text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform z-30 border-2 border-white">
                <span className="font-serif text-2xl font-bold leading-none select-none">&ldquo;</span>
              </div>

              <div className="flex items-start justify-between gap-5 mt-1 mb-5 relative z-10">
                <div className="flex-1 pr-2">
                  <p className="text-xs sm:text-[13.5px] text-slate-700 leading-relaxed font-medium">
                    &quot;{F(0).body}&quot;
                  </p>
                </div>
                <div className="relative w-15 h-15 rounded-full overflow-hidden shrink-0 border-3 border-white shadow-lg ring-2 ring-slate-100 bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  {(() => { const I0 = F(0).Icon; return <I0 className="w-6 h-6 text-white" />; })()}
                </div>
              </div>

              <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between relative z-10">
                <div>
                  <h4 className="text-xs font-bold text-[#1f2223]">{F(0).heading}</h4>
                  <p className="text-[11px] text-slate-500 font-medium">{F(0).tag}</p>
                </div>
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                  Verified Fact
                </span>
              </div>
            </div>

            {/* CARD 2: Speech Bubble with bottom-right icon avatar */}
            <div className={`relative glossy-card rounded-[38px] p-7 sm:p-8 hover-lift-card group ${animationsEnabled ? "animate-float-2" : ""}`}>
              <p className="text-xs sm:text-[13.5px] text-slate-700 leading-relaxed font-medium mb-6 relative z-10">
                &quot;{F(1).body}&quot;
              </p>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between relative z-10">
                <div>
                  <h4 className="text-xs font-bold text-[#1f2223]">{F(1).heading}</h4>
                  <p className="text-[11px] text-slate-500 font-medium">{F(1).tag}</p>
                </div>
                <div className="relative w-13 h-13 rounded-full overflow-hidden shrink-0 border-3 border-white shadow-lg ring-2 ring-slate-100 bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  {(() => { const I1 = F(1).Icon; return <I1 className="w-5 h-5 text-white" />; })()}
                </div>
              </div>
            </div>

            {/* CARD 9: Wide Card — 3 real channel icons instead of 3 fake reaction avatars */}
            <div className={`relative glossy-card rounded-[38px] p-7 sm:p-8 pb-9 hover-lift-card group ${animationsEnabled ? "animate-float-3" : ""}`}>
              <div className="text-center relative z-10">
                <h3 className="text-sm sm:text-base font-bold text-[#1f2223] mb-2">
                  One inbox, three channels
                </h3>
                <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed max-w-sm mx-auto font-medium">
                  &quot;Send and reply across email, LinkedIn, and WhatsApp from a single shared inbox.&quot;
                </p>
                <p className="text-[11px] font-semibold text-slate-400 mt-3">
                  Multi-Channel Outreach
                </p>
              </div>

              <div className="relative mt-6 pt-3 z-10">
                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-4 glossy-tail border-l border-t border-slate-200 rotate-45" />
                <div className="flex items-center justify-center gap-3.5 pt-2.5">
                  {[
                    { Icon: Mail, bg: "from-blue-500 to-indigo-600", name: "Email" },
                    { Icon: Briefcase, bg: "from-sky-500 to-blue-600", name: "LinkedIn" },
                    { Icon: MessageSquare, bg: "from-emerald-500 to-teal-600", name: "WhatsApp" },
                  ].map((c, idx) => (
                    <div
                      key={idx}
                      className={`relative w-12 h-12 rounded-full overflow-hidden border-3 border-white shadow-md ring-2 ring-slate-100 hover:scale-115 transition-transform duration-200 cursor-pointer z-20 bg-gradient-to-br ${c.bg} flex items-center justify-center`}
                      title={c.name}
                    >
                      <c.Icon className="w-5 h-5 text-white" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* ================= COLUMN 2 ================= */}
          <div className="flex flex-col gap-7 sm:gap-8">

            {/* CARD 5: Dome Arch icon badge, no fake star rating */}
            <div className={`relative glossy-card rounded-[38px] pt-14 p-7 sm:p-8 hover-lift-card group mt-10 ${animationsEnabled ? "animate-float-2" : ""}`}>
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-22 h-14 rounded-t-full bg-white border-t border-x border-white/90 shadow-sm flex items-start justify-center pt-1 z-20">
                <div className="relative w-15 h-15 rounded-full overflow-hidden border-3 border-white shadow-xl ring-2 ring-slate-100 group-hover:scale-105 transition-transform duration-300 bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  {(() => { const I3 = F(3).Icon; return <I3 className="w-6 h-6 text-white" />; })()}
                </div>
              </div>

              <div className="flex justify-center items-center gap-1.5 mb-3 relative z-10">
                <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{F(3).tag}</span>
              </div>

              <div className="text-center mb-5 relative z-10">
                <h3 className="text-base sm:text-lg font-bold text-[#1f2223] mb-2.5">
                  {F(3).heading}
                </h3>
                <p className="text-xs sm:text-[13.5px] text-slate-600 leading-relaxed font-medium">
                  &quot;{F(3).body}&quot;
                </p>
              </div>

              <div className="pt-3.5 border-t border-slate-100 flex items-center justify-center relative z-10">
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                  Verified Fact
                </span>
              </div>
            </div>

            {/* CARD 3: Tall panel with icon instead of a stock portrait */}
            <div className={`relative glossy-card rounded-[38px] overflow-hidden hover-lift-card group ${animationsEnabled ? "animate-float-1" : ""}`}>
              <div className="relative w-full h-56 sm:h-60 overflow-hidden bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-500 rounded-t-[38px] flex items-center justify-center">
                {(() => { const I4 = F(4).Icon; return <I4 className="w-16 h-16 text-white/90" />; })()}
              </div>

              <div className="p-6 sm:p-7 text-center relative z-10">
                <p className="text-xs sm:text-[13.5px] text-slate-700 leading-relaxed font-medium mb-3.5">
                  &quot;{F(4).body}&quot;
                </p>
                <div className="font-signature text-xl sm:text-2xl text-slate-800 select-none tracking-wide font-semibold">
                  {F(4).heading}
                </div>
              </div>
            </div>

            {/* CARD 4: Dome Arch, no fake rating, no fake signature */}
            <div className={`relative glossy-card rounded-[38px] pt-14 pb-9 p-7 sm:p-8 hover-lift-card group mt-10 mb-5 ${animationsEnabled ? "animate-float-3" : ""}`}>
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-14 rounded-t-full bg-white border-t border-x border-white/90 shadow-sm flex items-start justify-center pt-1 z-20">
                <div className="relative w-14 h-14 rounded-full overflow-hidden border-3 border-white shadow-xl ring-2 ring-slate-100 group-hover:scale-105 transition-transform duration-300 bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center">
                  {(() => { const I5 = F(5).Icon; return <I5 className="w-5.5 h-5.5 text-white" />; })()}
                </div>
              </div>

              <div className="flex justify-center items-center gap-1.5 mb-3 relative z-10">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{F(5).tag}</span>
              </div>

              <p className="text-center text-xs sm:text-[13px] text-slate-600 leading-relaxed mb-3.5 relative z-10 font-medium">
                &quot;{F(5).body}&quot;
              </p>

              <div className="text-center text-sm sm:text-base text-slate-800 select-none font-bold relative z-10">
                {F(5).heading}
              </div>

              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 glossy-tail border-r border-b border-slate-200 rotate-45 z-20" />
            </div>

          </div>

          {/* ================= COLUMN 3 ================= */}
          <div className="flex flex-col gap-7 sm:gap-8">

            {/* CARD 6: Pill Bubble with Dome Arch */}
            <div className={`relative glossy-card rounded-[38px] pt-14 p-7 sm:p-8 hover-lift-card group mt-10 ${animationsEnabled ? "animate-float-1" : ""}`}>
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-14 rounded-t-full bg-white border-t border-x border-white/90 shadow-sm flex items-start justify-center pt-1 z-20">
                <div className="relative w-13 h-13 rounded-full overflow-hidden border-3 border-white shadow-xl ring-2 ring-slate-100 group-hover:scale-105 transition-transform duration-300 bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
                  {(() => { const I2 = F(2).Icon; return <I2 className="w-5 h-5 text-white" />; })()}
                </div>
              </div>

              <div className="text-center relative z-10">
                <h3 className="text-sm sm:text-base font-bold text-[#1f2223] mb-1.5">
                  {F(2).heading}
                </h3>
                <div className="flex justify-center items-center gap-1.5 mb-2.5">
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{F(2).tag}</span>
                </div>
                <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed font-medium">
                  &quot;{F(2).body}&quot;
                </p>
              </div>
            </div>

            {/* CARD 7: Side-by-Side Split Card — icon panel instead of a stock photo */}
            <div className={`relative glossy-card rounded-[38px] overflow-hidden isolate hover-lift-card group ${animationsEnabled ? "animate-float-2" : ""}`}>
              <div className="grid grid-cols-5 items-stretch min-h-[180px] rounded-[38px] overflow-hidden">
                <div className="col-span-2 relative bg-gradient-to-br from-cyan-500 to-blue-600 rounded-l-[38px] overflow-hidden flex items-center justify-center">
                  {(() => { const I6 = F(6).Icon; return <I6 className="w-10 h-10 text-white" />; })()}
                </div>

                <div className="col-span-3 p-5 sm:p-6 flex flex-col justify-between relative z-10">
                  <div>
                    <div className="flex items-center gap-1 text-[#1f2223] mb-2">
                      <span className="font-serif text-xl font-bold">&ldquo;</span>
                      <span className="text-xs font-bold tracking-tight">{F(6).tag}</span>
                      <span className="font-serif text-xl font-bold">&rdquo;</span>
                    </div>
                    <p className="text-[11.5px] sm:text-xs text-slate-600 leading-relaxed font-medium">
                      &quot;{F(6).body}&quot;
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-[#1f2223]">{F(6).heading}</h4>
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 8: Inverted Split Card */}
            <div className={`relative glossy-card rounded-[38px] overflow-hidden hover-lift-card group ${animationsEnabled ? "animate-float-3" : ""}`}>
              <div className="grid grid-cols-5 items-center p-6 sm:p-7 gap-4 relative z-10">
                <div className="col-span-3">
                  <p className="text-xs sm:text-[13px] text-slate-700 leading-relaxed font-medium">
                    &quot;{F(7).body}&quot;
                  </p>
                </div>

                <div className="col-span-2 flex flex-col items-center text-center bg-slate-50/90 p-3.5 rounded-[26px] border border-slate-100 shadow-inner">
                  <div className="relative w-13 h-13 rounded-full overflow-hidden border-3 border-white shadow-md ring-2 ring-slate-100 mb-2 bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center">
                    {(() => { const I7 = F(7).Icon; return <I7 className="w-5 h-5 text-white" />; })()}
                  </div>
                  <h4 className="text-[11px] font-bold text-[#1f2223] leading-tight">{F(7).heading}</h4>
                  <p className="text-[10px] text-slate-500 font-medium">{F(7).tag}</p>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Bottom bar — no fabricated rating, an honest line instead */}
        <div className="mt-14 sm:mt-18 glossy-card rounded-[36px] p-6 sm:p-8 max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-500 shrink-0 shadow-inner">
              <Star className="w-6.5 h-6.5 fill-amber-400 text-amber-400 animate-star-twinkle drop-shadow-[0_2px_6px_rgba(251,191,36,0.6)]" />
            </div>
            <div>
              <div className="text-base font-extrabold text-[#1f2223] text-left">
                No reviews yet — by design, not by accident.
              </div>
              <p className="text-xs text-slate-500 font-medium">
                We&apos;d rather earn real ones than publish fake ones.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAnimationsEnabled(!animationsEnabled)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all border border-slate-200 cursor-pointer shadow-sm"
            >
              {animationsEnabled ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span>Floating: On</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-slate-500" />
                  <span>Floating: Off</span>
                </>
              )}
            </button>
            <a
              href="#pricing"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-[#1f2223] text-white text-xs font-semibold hover:bg-black transition-all shadow-md hover:scale-105"
            >
              Try it yourself
            </a>
          </div>
        </div>

      </div>
    </section>
  );
}
