"use client";

import { useState } from "react";
import Image from "next/image";
import { Star, Sparkles, CheckCircle2 } from "lucide-react";

export function TestimonialsBentoSection() {
  const [activeTab, setActiveTab] = useState<"all" | "founders" | "sales" | "growth">("all");
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  return (
    <section id="testimonials" className="py-24 sm:py-32 bg-transparent relative overflow-hidden transition-colors">
      {/* Radiant ambient colorful glass light sources */}
      <div className="absolute -top-10 left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-blue-500/20 via-sky-400/15 to-transparent dark:from-blue-600/15 dark:via-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-1/2 right-10 w-[550px] h-[550px] bg-gradient-to-br from-indigo-500/20 via-purple-400/15 to-pink-300/10 dark:from-indigo-600/15 dark:via-purple-600/10 rounded-full blur-[110px] pointer-events-none" />
      <div className="absolute -bottom-10 left-10 w-[450px] h-[450px] bg-gradient-to-tr from-teal-400/20 via-emerald-300/15 to-transparent dark:from-teal-600/15 rounded-full blur-[90px] pointer-events-none" />

      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header section */}
        <div className="max-w-3xl mx-auto text-center mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-md border border-white/25 shadow-sm mb-4 text-xs font-semibold text-blue-100">
            <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300 animate-star-twinkle" />
            <span>Real Feedback from Real Teams</span>
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight">
            Loved by fast-growing <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-orange-200 to-cyan-200">
              sales and revenue teams.
            </span>
          </h2>

          <p className="text-base sm:text-lg text-blue-50 mt-4 leading-relaxed max-w-2xl mx-auto font-medium">
            See how founders, SDR leaders, and outbound teams scale their pipeline and find verified decision-makers using Nxelio.
          </p>

          {/* Interactive filter pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
            {[
              { id: "all", label: "All Stories", count: "9" },
              { id: "founders", label: "Founders & Execs", count: "3" },
              { id: "sales", label: "Sales & SDRs", count: "3" },
              { id: "growth", label: "Growth Teams", count: "3" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                  activeTab === tab.id
                    ? "bg-[#1f2223] text-white dark:bg-white dark:text-slate-950 shadow-lg scale-105"
                    : "glossy-card text-slate-700 dark:text-slate-300 hover:scale-102"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  activeTab === tab.id
                    ? "bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900"
                    : "bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Bento / Masonry Grid matching reference layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7 items-start">
          
          {/* ================= COLUMN 1 (Left Column) ================= */}
          <div className="flex flex-col gap-6 sm:gap-7">
            
            {/* CARD 1: Speech Bubble with top-left Quote badge & top-right circular avatar */}
            {(activeTab === "all" || activeTab === "growth") && (
              <div className={`relative glossy-card glossy-reflection glossy-sweep rounded-[28px] p-6 sm:p-7 hover-lift-card group ${animationsEnabled ? "animate-float-1" : ""}`}>
                {/* Dark floating quotation mark badge */}
                <div className="absolute -top-3.5 left-6 w-9 h-9 rounded-2xl bg-[#1f2223] dark:bg-blue-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform z-10 border border-white/20">
                  <span className="font-serif text-xl font-bold leading-none select-none">“</span>
                </div>

                <div className="flex items-start justify-between gap-4 mt-2 mb-4 relative z-10">
                  <div className="flex-1 pr-2">
                    <p className="text-xs sm:text-[13px] text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                      &quot;Nxelio transformed how our growth team sources verified leads. The waterfall lookup cut our email bounce rate by 80% and booked 40+ meetings in month one.&quot;
                    </p>
                  </div>
                  {/* Circular Avatar with Glossy Ring */}
                  <div className="relative w-14 h-14 rounded-full overflow-hidden shrink-0 border-2 border-white/90 dark:border-slate-700 shadow-md ring-2 ring-white/60 dark:ring-white/10">
                    <Image
                      src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"
                      alt="James Wilson"
                      width={56}
                      height={56}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      unoptimized
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between relative z-10">
                  <div>
                    <h4 className="text-xs font-bold text-[#1f2223] dark:text-white">James Wilson</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">VP of Growth · PeakVenture</p>
                  </div>
                  <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/90 dark:bg-blue-950/80 px-2 py-0.5 rounded-md border border-blue-200/50 dark:border-blue-800/50">
                    Verified Customer
                  </span>
                </div>
              </div>
            )}

            {/* CARD 2: Speech Bubble with bottom-right avatar cutout */}
            {(activeTab === "all" || activeTab === "founders") && (
              <div className={`relative glossy-card glossy-reflection glossy-sweep rounded-[28px] p-6 sm:p-7 hover-lift-card group ${animationsEnabled ? "animate-float-2" : ""}`}>
                <p className="text-xs sm:text-[13px] text-slate-700 dark:text-slate-200 leading-relaxed font-medium mb-6 relative z-10">
                  &quot;The pre-built multi-step outreach sequences helped us close $120k in new pipeline within our first 3 weeks. The workflow simplicity is unmatched.&quot;
                </p>

                <div className="pt-4 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between relative z-10">
                  <div>
                    <h4 className="text-xs font-bold text-[#1f2223] dark:text-white">Victoria Wotton</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Founding Partner · Odio Co.</p>
                  </div>

                  {/* Circular Avatar */}
                  <div className="relative w-12 h-12 rounded-full overflow-hidden shrink-0 border-2 border-white/90 dark:border-slate-700 shadow-md ring-2 ring-white/60 dark:ring-white/10">
                    <Image
                      src="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80"
                      alt="Victoria Wotton"
                      width={48}
                      height={48}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      unoptimized
                    />
                  </div>
                </div>
              </div>
            )}

            {/* CARD 9: Wide Multi-Avatar Reaction Card with speech-bubble pointer to 3 avatars */}
            {(activeTab === "all" || activeTab === "sales") && (
              <div className={`relative glossy-card glossy-reflection glossy-sweep rounded-[28px] p-6 sm:p-7 pb-8 hover-lift-card group ${animationsEnabled ? "animate-float-3" : ""}`}>
                <div className="text-center relative z-10">
                  <h3 className="text-sm sm:text-base font-bold text-[#1f2223] dark:text-white mb-2">
                    I was very impressed!
                  </h3>
                  <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed max-w-sm mx-auto font-medium">
                    &quot;The unified integration between prospect lookup, personalized cold email sequences, and meeting scheduler replaced 4 separate tools for our entire SDR team.&quot;
                  </p>
                  <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mt-2.5">
                    Wilson &amp; Partners
                  </p>
                </div>

                {/* Speech Bubble bottom pointer pointing down to avatar row */}
                <div className="relative mt-5 pt-3 z-10">
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3.5 h-3.5 glossy-tail border-l border-t rotate-45" />

                  {/* 3 Circular Avatar Heads */}
                  <div className="flex items-center justify-center gap-3 pt-2">
                    {[
                      { src: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80", name: "David" },
                      { src: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80", name: "Marc" },
                      { src: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&auto=format&fit=crop&q=80", name: "Sarah" },
                    ].map((person, idx) => (
                      <div
                        key={idx}
                        className="relative w-11 h-11 rounded-full overflow-hidden border-2 border-white/90 dark:border-slate-700 shadow-md ring-2 ring-white/60 dark:ring-white/10 hover:scale-115 transition-transform duration-200 cursor-pointer"
                        title={person.name}
                      >
                        <Image
                          src={person.src}
                          alt={person.name}
                          width={44}
                          height={44}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* ================= COLUMN 2 (Center Column) ================= */}
          <div className="flex flex-col gap-6 sm:gap-7">

            {/* CARD 5: Protruding Avatar Header with 5 Stars, Bold Headline & Quote Mark Badge */}
            {(activeTab === "all" || activeTab === "founders") && (
              <div className={`relative glossy-card glossy-reflection glossy-sweep rounded-[30px] pt-12 p-6 sm:p-7 hover-lift-card group mt-5 ${animationsEnabled ? "animate-float-2" : ""}`}>
                
                {/* Protruding circular avatar at top-center with gloss ring */}
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full overflow-hidden border-3 border-white dark:border-slate-900 shadow-xl ring-2 ring-white/80 dark:ring-white/20 group-hover:scale-110 transition-transform duration-300 z-20">
                  <Image
                    src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80"
                    alt="Hindley Earnshaw"
                    width={56}
                    height={56}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                </div>

                {/* 5 Stars Rating with Twinkle */}
                <div className="flex justify-center items-center gap-1 mb-2.5 relative z-10">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400 drop-shadow-[0_1px_4px_rgba(251,191,36,0.5)]" />
                  ))}
                </div>

                <div className="text-center mb-4 relative z-10">
                  <h3 className="text-sm sm:text-base font-bold text-[#1f2223] dark:text-white mb-2">
                    I really appreciate!!
                  </h3>
                  <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                    &quot;Finding verified mobile numbers and running automated multi-channel sequences has never been this fast. Our reps love it.&quot;
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between relative z-10">
                  <div>
                    <h4 className="text-xs font-bold text-[#1f2223] dark:text-white">Hindley Earnshaw</h4>
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">@Hindley.Ex</p>
                  </div>
                  
                  {/* Decorative Dark Quote Badge at bottom right */}
                  <div className="w-7 h-7 rounded-xl bg-[#1f2223] dark:bg-blue-600 text-white flex items-center justify-center shadow-md border border-white/20">
                    <span className="font-serif text-sm font-bold leading-none">”</span>
                  </div>
                </div>
              </div>
            )}

            {/* CARD 3: Tall Vertical Portrait Card with Hand-written Signature */}
            {(activeTab === "all" || activeTab === "sales") && (
              <div className={`relative glossy-card glossy-reflection glossy-sweep rounded-[28px] overflow-hidden hover-lift-card group ${animationsEnabled ? "animate-float-1" : ""}`}>
                {/* Top Portrait Photo */}
                <div className="relative w-full h-52 sm:h-56 overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <Image
                    src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=500&auto=format&fit=crop&q=80"
                    alt="Isabella Linton"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-white/90 dark:from-slate-900/90 via-transparent to-transparent opacity-80" />
                </div>

                <div className="p-5 sm:p-6 text-center relative z-10">
                  <p className="text-xs sm:text-[13px] text-slate-700 dark:text-slate-200 leading-relaxed font-medium mb-3">
                    &quot;Nxelio is the only all-in-one sales intelligence platform that delivered on every single promise.&quot;
                  </p>
                  
                  {/* Handwritten signature */}
                  <div className="font-signature text-2xl sm:text-3xl text-slate-800 dark:text-slate-100 select-none tracking-wide font-semibold">
                    Isabella Linton
                  </div>
                </div>
              </div>
            )}

            {/* CARD 4: Speech Bubble with top avatar, 5 Stars, Signature & Bottom Pointer Tail */}
            {(activeTab === "all" || activeTab === "growth") && (
              <div className={`relative glossy-card glossy-reflection glossy-sweep rounded-[30px] pt-10 p-6 sm:p-7 hover-lift-card group mt-5 ${animationsEnabled ? "animate-float-3" : ""}`}>
                
                {/* Protruding avatar top-center */}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-13 h-13 rounded-full overflow-hidden border-3 border-white dark:border-slate-900 shadow-xl ring-2 ring-white/80 dark:ring-white/20 group-hover:scale-110 transition-transform duration-300 z-20">
                  <Image
                    src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80"
                    alt="Isabella Linton"
                    width={52}
                    height={52}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                </div>

                {/* 5 Stars Rating */}
                <div className="flex justify-center items-center gap-1 mb-2.5 relative z-10">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400 drop-shadow-[0_1px_4px_rgba(251,191,36,0.5)]" />
                  ))}
                </div>

                <p className="text-center text-xs sm:text-[12.5px] text-slate-600 dark:text-slate-300 leading-relaxed italic mb-3 relative z-10 font-medium">
                  &quot;Semper feugiat nibh sed pulvinar proin gravida hendrerit. The AI prospect search saved our team 15+ hours weekly.&quot;
                </p>

                <div className="text-center font-signature text-xl sm:text-2xl text-slate-700 dark:text-slate-200 select-none font-semibold relative z-10">
                  Isabella Linton
                </div>

                {/* Glossy Speech Bubble bottom pointer tail */}
                <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-5 h-5 glossy-tail border-r border-b rotate-45 z-10" />
              </div>
            )}

          </div>

          {/* ================= COLUMN 3 (Right Column) ================= */}
          <div className="flex flex-col gap-6 sm:gap-7">

            {/* CARD 6: Pill / Bubble Card with Top Floating Avatar & Good Job! */}
            {(activeTab === "all" || activeTab === "founders") && (
              <div className={`relative glossy-card glossy-reflection glossy-sweep rounded-[28px] pt-10 p-6 sm:p-7 hover-lift-card group mt-5 ${animationsEnabled ? "animate-float-1" : ""}`}>
                
                {/* Protruding top avatar */}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full overflow-hidden border-2 border-white dark:border-slate-900 shadow-xl ring-2 ring-white/80 dark:ring-white/20 group-hover:scale-110 transition-transform duration-300 z-20">
                  <Image
                    src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"
                    alt="Founder"
                    width={48}
                    height={48}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                </div>

                <div className="text-center relative z-10">
                  <h3 className="text-sm font-bold text-[#1f2223] dark:text-white mb-1">
                    Good Job!
                  </h3>
                  
                  {/* 5 Stars */}
                  <div className="flex justify-center items-center gap-1 mb-2">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400 drop-shadow-[0_1px_4px_rgba(251,191,36,0.5)]" />
                    ))}
                  </div>

                  <p className="text-xs sm:text-[12.5px] text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                    &quot;Super fast onboarding. We went from signup to launching our first live outreach campaign in under 10 minutes.&quot;
                  </p>
                </div>
              </div>
            )}

            {/* CARD 7: Side-by-Side Split Card (Portrait on Left, Quote on Right) */}
            {(activeTab === "all" || activeTab === "sales") && (
              <div className={`relative glossy-card glossy-reflection glossy-sweep rounded-[28px] overflow-hidden hover-lift-card group ${animationsEnabled ? "animate-float-2" : ""}`}>
                <div className="grid grid-cols-5 items-stretch min-h-[170px]">
                  
                  {/* Left Half: Photo */}
                  <div className="col-span-2 relative bg-slate-200 dark:bg-slate-800">
                    <Image
                      src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80"
                      alt="Henry Vance"
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      unoptimized
                    />
                  </div>

                  {/* Right Half: Quote Content */}
                  <div className="col-span-3 p-4 sm:p-5 flex flex-col justify-between relative z-10">
                    <div>
                      <div className="flex items-center gap-1 text-[#1f2223] dark:text-white mb-1.5">
                        <span className="font-serif text-lg font-bold">“</span>
                        <span className="text-[11px] font-bold tracking-tight">Verified dials found</span>
                        <span className="font-serif text-lg font-bold">”</span>
                      </div>
                      <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                        &quot;Waterfall lookup is pure magic. It unlocked verified direct dials our previous CRM completely missed.&quot;
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
                      <h4 className="text-xs font-bold text-[#1f2223] dark:text-white">Henry Vance</h4>
                      <p className="text-[10px] text-slate-500 font-medium">Fermentum Co.</p>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* CARD 8: Inverted Split Card (Quote on Left, Avatar on Right) */}
            {(activeTab === "all" || activeTab === "growth") && (
              <div className={`relative glossy-card glossy-reflection glossy-sweep rounded-[28px] overflow-hidden hover-lift-card group ${animationsEnabled ? "animate-float-3" : ""}`}>
                <div className="grid grid-cols-5 items-center p-5 sm:p-6 gap-4 relative z-10">
                  
                  {/* Left: Quote */}
                  <div className="col-span-3">
                    <p className="text-xs sm:text-[12.5px] text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                      &quot;Our team response rates tripled within two weeks of switching to Nxelio&apos;s AI email sequencing.&quot;
                    </p>
                  </div>

                  {/* Right: Circular Avatar & Name with Glass Container */}
                  <div className="col-span-2 flex flex-col items-center text-center bg-white/60 dark:bg-slate-800/50 p-3 rounded-2xl border border-white/80 dark:border-slate-700/50 shadow-inner">
                    <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-white dark:border-slate-800 shadow-md ring-2 ring-white/60 dark:ring-white/10 mb-2">
                      <Image
                        src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80"
                        alt="Basil Hallward"
                        width={48}
                        height={48}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        unoptimized
                      />
                    </div>
                    <h4 className="text-[11px] font-bold text-[#1f2223] dark:text-white leading-tight">Basil Hallward</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Co-Founder Gravida</p>
                  </div>

                </div>
              </div>
            )}

          </div>

        </div>

        {/* Bottom live stats & satisfaction bar with Glossy Backdrop */}
        <div className="mt-14 sm:mt-16 glossy-card glossy-reflection rounded-3xl p-6 sm:p-8 max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-500 shrink-0 shadow-inner">
              <Star className="w-6 h-6 fill-amber-400 text-amber-400 animate-star-twinkle drop-shadow-[0_2px_6px_rgba(251,191,36,0.6)]" />
            </div>
            <div>
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <span className="text-xl font-extrabold text-[#1f2223] dark:text-white">4.9 / 5.0</span>
                <div className="flex text-amber-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-400 drop-shadow-[0_1px_3px_rgba(251,191,36,0.4)]" />
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Average rating from 450+ high-growth sales teams &amp; founders.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAnimationsEnabled(!animationsEnabled)}
              className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-white/70 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all border border-white/60 dark:border-slate-700 cursor-pointer shadow-sm"
            >
              {animationsEnabled ? "✨ Floating: On" : "⏸️ Floating: Off"}
            </button>
            <a
              href="#pricing"
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-[#1f2223] dark:bg-blue-600 text-white text-xs font-semibold hover:bg-black dark:hover:bg-blue-500 transition-all shadow-md hover:scale-105"
            >
              Join these teams
            </a>
          </div>
        </div>

      </div>
    </section>
  );
}
