"use client";

import { useState } from "react";
import Image from "next/image";
import { Star, Sparkles, Pause } from "lucide-react";

export function TestimonialsBentoSection() {
  const [activeTab, setActiveTab] = useState<"all" | "founders" | "sales" | "growth">("all");
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

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
                className={`px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                  activeTab === tab.id
                    ? "bg-[#1f2223] text-white shadow-xl scale-105"
                    : "bg-white/80 hover:bg-white text-slate-800 shadow-sm border border-white/80 hover:scale-102"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  activeTab === tab.id
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Bento / Masonry Grid with Deep Curves */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7 sm:gap-8 items-start">
          
          {/* ================= COLUMN 1 (Left Column) ================= */}
          <div className="flex flex-col gap-7 sm:gap-8">
            
            {/* CARD 1: Speech Bubble with top-left Quote badge & top-right circular avatar */}
            {(activeTab === "all" || activeTab === "growth") && (
              <div className={`relative glossy-card rounded-[38px] p-7 sm:p-8 pt-9 hover-lift-card group mt-4 ${animationsEnabled ? "animate-float-1" : ""}`}>
                {/* Dark floating quotation mark badge */}
                <div className="absolute -top-4 left-7 w-10 h-10 rounded-2xl bg-[#1f2223] text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform z-30 border-2 border-white">
                  <span className="font-serif text-2xl font-bold leading-none select-none">“</span>
                </div>

                <div className="flex items-start justify-between gap-5 mt-1 mb-5 relative z-10">
                  <div className="flex-1 pr-2">
                    <p className="text-xs sm:text-[13.5px] text-slate-700 leading-relaxed font-medium">
                      &quot;Nxelio transformed how our growth team sources verified leads. The waterfall lookup cut our email bounce rate by 80% and booked 40+ meetings in month one.&quot;
                    </p>
                  </div>
                  {/* Circular Avatar */}
                  <div className="relative w-15 h-15 rounded-full overflow-hidden shrink-0 border-3 border-white shadow-lg ring-2 ring-slate-100">
                    <Image
                      src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"
                      alt="James Wilson"
                      width={60}
                      height={60}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      unoptimized
                    />
                  </div>
                </div>

                <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between relative z-10">
                  <div>
                    <h4 className="text-xs font-bold text-[#1f2223]">James Wilson</h4>
                    <p className="text-[11px] text-slate-500 font-medium">VP of Growth · PeakVenture</p>
                  </div>
                  <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                    Verified Customer
                  </span>
                </div>
              </div>
            )}

            {/* CARD 2: Speech Bubble with bottom-right avatar cutout */}
            {(activeTab === "all" || activeTab === "founders") && (
              <div className={`relative glossy-card rounded-[38px] p-7 sm:p-8 hover-lift-card group ${animationsEnabled ? "animate-float-2" : ""}`}>
                <p className="text-xs sm:text-[13.5px] text-slate-700 leading-relaxed font-medium mb-6 relative z-10">
                  &quot;The pre-built multi-step outreach sequences helped us close $120k in new pipeline within our first 3 weeks. The workflow simplicity is unmatched.&quot;
                </p>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between relative z-10">
                  <div>
                    <h4 className="text-xs font-bold text-[#1f2223]">Victoria Wotton</h4>
                    <p className="text-[11px] text-slate-500 font-medium">Founding Partner · Odio Co.</p>
                  </div>

                  {/* Circular Avatar */}
                  <div className="relative w-13 h-13 rounded-full overflow-hidden shrink-0 border-3 border-white shadow-lg ring-2 ring-slate-100">
                    <Image
                      src="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80"
                      alt="Victoria Wotton"
                      width={52}
                      height={52}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      unoptimized
                    />
                  </div>
                </div>
              </div>
            )}

            {/* CARD 9: Wide Multi-Avatar Reaction Card with speech-bubble pointer to 3 avatars */}
            {(activeTab === "all" || activeTab === "sales") && (
              <div className={`relative glossy-card rounded-[38px] p-7 sm:p-8 pb-9 hover-lift-card group ${animationsEnabled ? "animate-float-3" : ""}`}>
                <div className="text-center relative z-10">
                  <h3 className="text-sm sm:text-base font-bold text-[#1f2223] mb-2">
                    I was very impressed!
                  </h3>
                  <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed max-w-sm mx-auto font-medium">
                    &quot;The unified integration between prospect lookup, personalized cold email sequences, and meeting scheduler replaced 4 separate tools for our entire SDR team.&quot;
                  </p>
                  <p className="text-[11px] font-semibold text-slate-400 mt-3">
                    Wilson &amp; Partners
                  </p>
                </div>

                {/* Speech Bubble bottom pointer pointing down to avatar row */}
                <div className="relative mt-6 pt-3 z-10">
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-4 glossy-tail border-l border-t border-slate-200 rotate-45" />

                  {/* 3 Circular Avatar Heads */}
                  <div className="flex items-center justify-center gap-3.5 pt-2.5">
                    {[
                      { src: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80", name: "David" },
                      { src: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80", name: "Marc" },
                      { src: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&auto=format&fit=crop&q=80", name: "Sarah" },
                    ].map((person, idx) => (
                      <div
                        key={idx}
                        className="relative w-12 h-12 rounded-full overflow-hidden border-3 border-white shadow-md ring-2 ring-slate-100 hover:scale-115 transition-transform duration-200 cursor-pointer z-20"
                        title={person.name}
                      >
                        <Image
                          src={person.src}
                          alt={person.name}
                          width={48}
                          height={48}
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
          <div className="flex flex-col gap-7 sm:gap-8">

            {/* CARD 5: Speech Bubble with Integrated Top Curved Dome Arch & 5 Stars */}
            {(activeTab === "all" || activeTab === "founders") && (
              <div className={`relative glossy-card rounded-[38px] pt-14 p-7 sm:p-8 hover-lift-card group mt-10 ${animationsEnabled ? "animate-float-2" : ""}`}>
                
                {/* Seamless Curved Top Dome Arch with circular avatar */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-22 h-14 rounded-t-full bg-white border-t border-x border-white/90 shadow-sm flex items-start justify-center pt-1 z-20">
                  <div className="relative w-15 h-15 rounded-full overflow-hidden border-3 border-white shadow-xl ring-2 ring-slate-100 group-hover:scale-105 transition-transform duration-300">
                    <Image
                      src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80"
                      alt="Hindley Earnshaw"
                      width={60}
                      height={60}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                </div>

                {/* 5 Stars Rating */}
                <div className="flex justify-center items-center gap-1 mb-3 relative z-10">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4.5 h-4.5 fill-amber-400 text-amber-400 drop-shadow-[0_1px_3px_rgba(251,191,36,0.4)]" />
                  ))}
                </div>

                <div className="text-center mb-5 relative z-10">
                  <h3 className="text-base sm:text-lg font-bold text-[#1f2223] mb-2.5">
                    I really appreciate!!
                  </h3>
                  <p className="text-xs sm:text-[13.5px] text-slate-600 leading-relaxed font-medium">
                    &quot;Finding verified mobile numbers and running automated multi-channel sequences has never been this fast. Our reps love it.&quot;
                  </p>
                </div>

                <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between relative z-10">
                  <div>
                    <h4 className="text-xs font-bold text-[#1f2223]">Hindley Earnshaw</h4>
                    <p className="text-[11px] text-blue-600 font-semibold">@Hindley.Ex</p>
                  </div>
                  
                  {/* Decorative Dark Quote Badge at bottom right */}
                  <div className="w-8 h-8 rounded-2xl bg-[#1f2223] text-white flex items-center justify-center shadow-md border border-white/20">
                    <span className="font-serif text-base font-bold leading-none">”</span>
                  </div>
                </div>
              </div>
            )}

            {/* CARD 3: Tall Vertical Portrait Card with Deep Curved Corners & Hand-written Signature */}
            {(activeTab === "all" || activeTab === "sales") && (
              <div className={`relative glossy-card rounded-[38px] overflow-hidden hover-lift-card group ${animationsEnabled ? "animate-float-1" : ""}`}>
                {/* Top Portrait Photo */}
                <div className="relative w-full h-56 sm:h-60 overflow-hidden bg-slate-100 rounded-t-[38px]">
                  <Image
                    src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=500&auto=format&fit=crop&q=80"
                    alt="Isabella Linton"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-transparent to-transparent opacity-80" />
                </div>

                <div className="p-6 sm:p-7 text-center relative z-10">
                  <p className="text-xs sm:text-[13.5px] text-slate-700 leading-relaxed font-medium mb-3.5">
                    &quot;Nxelio is the only all-in-one sales intelligence platform that delivered on every single promise.&quot;
                  </p>
                  
                  {/* Handwritten signature */}
                  <div className="font-signature text-2xl sm:text-3xl text-slate-800 select-none tracking-wide font-semibold">
                    Isabella Linton
                  </div>
                </div>
              </div>
            )}

            {/* CARD 4: Speech Bubble with Top Curved Dome, Signature & Bottom Pointer Tail */}
            {(activeTab === "all" || activeTab === "growth") && (
              <div className={`relative glossy-card rounded-[38px] pt-14 pb-9 p-7 sm:p-8 hover-lift-card group mt-10 mb-5 ${animationsEnabled ? "animate-float-3" : ""}`}>
                
                {/* Seamless Curved Top Dome Arch with circular avatar */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-14 rounded-t-full bg-white border-t border-x border-white/90 shadow-sm flex items-start justify-center pt-1 z-20">
                  <div className="relative w-14 h-14 rounded-full overflow-hidden border-3 border-white shadow-xl ring-2 ring-slate-100 group-hover:scale-105 transition-transform duration-300">
                    <Image
                      src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80"
                      alt="Isabella Linton"
                      width={56}
                      height={56}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                </div>

                {/* 5 Stars Rating */}
                <div className="flex justify-center items-center gap-1 mb-3 relative z-10">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400 drop-shadow-[0_1px_3px_rgba(251,191,36,0.4)]" />
                  ))}
                </div>

                <p className="text-center text-xs sm:text-[13px] text-slate-600 leading-relaxed italic mb-3.5 relative z-10 font-medium">
                  &quot;Semper feugiat nibh sed pulvinar proin gravida hendrerit. The AI prospect search saved our team 15+ hours weekly.&quot;
                </p>

                <div className="text-center font-signature text-2xl sm:text-3xl text-slate-700 select-none font-semibold relative z-10">
                  Isabella Linton
                </div>

                {/* Glossy Speech Bubble bottom pointer tail */}
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 glossy-tail border-r border-b border-slate-200 rotate-45 z-20" />
              </div>
            )}

          </div>

          {/* ================= COLUMN 3 (Right Column) ================= */}
          <div className="flex flex-col gap-7 sm:gap-8">

            {/* CARD 6: Pill Bubble Card with Top Curved Arch & Good Job! */}
            {(activeTab === "all" || activeTab === "founders") && (
              <div className={`relative glossy-card rounded-[38px] pt-14 p-7 sm:p-8 hover-lift-card group mt-10 ${animationsEnabled ? "animate-float-1" : ""}`}>
                
                {/* Seamless Curved Top Dome Arch with circular avatar */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-14 rounded-t-full bg-white border-t border-x border-white/90 shadow-sm flex items-start justify-center pt-1 z-20">
                  <div className="relative w-13 h-13 rounded-full overflow-hidden border-3 border-white shadow-xl ring-2 ring-slate-100 group-hover:scale-105 transition-transform duration-300">
                    <Image
                      src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"
                      alt="Founder"
                      width={52}
                      height={52}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                </div>

                <div className="text-center relative z-10">
                  <h3 className="text-sm sm:text-base font-bold text-[#1f2223] mb-1.5">
                    Good Job!
                  </h3>
                  
                  {/* 5 Stars */}
                  <div className="flex justify-center items-center gap-1 mb-2.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400 drop-shadow-[0_1px_3px_rgba(251,191,36,0.4)]" />
                    ))}
                  </div>

                  <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed font-medium">
                    &quot;Super fast onboarding. We went from signup to launching our first live outreach campaign in under 10 minutes.&quot;
                  </p>
                </div>
              </div>
            )}

            {/* CARD 7: Side-by-Side Split Card with Deep Curved Corners */}
            {(activeTab === "all" || activeTab === "sales") && (
              <div className={`relative glossy-card rounded-[38px] overflow-hidden isolate hover-lift-card group ${animationsEnabled ? "animate-float-2" : ""}`}>
                <div className="grid grid-cols-5 items-stretch min-h-[180px] rounded-[38px] overflow-hidden">
                  
                  {/* Left Half: Photo with matching left rounded curve */}
                  <div className="col-span-2 relative bg-slate-200 rounded-l-[38px] overflow-hidden">
                    <Image
                      src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80"
                      alt="Henry Vance"
                      fill
                      className="object-cover rounded-l-[38px] group-hover:scale-105 transition-transform duration-500"
                      unoptimized
                    />
                  </div>

                  {/* Right Half: Quote Content */}
                  <div className="col-span-3 p-5 sm:p-6 flex flex-col justify-between relative z-10">
                    <div>
                      <div className="flex items-center gap-1 text-[#1f2223] mb-2">
                        <span className="font-serif text-xl font-bold">“</span>
                        <span className="text-xs font-bold tracking-tight">Verified dials found</span>
                        <span className="font-serif text-xl font-bold">”</span>
                      </div>
                      <p className="text-[11.5px] sm:text-xs text-slate-600 leading-relaxed font-medium">
                        &quot;Waterfall lookup is pure magic. It unlocked verified direct dials our previous CRM completely missed.&quot;
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-slate-100">
                      <h4 className="text-xs font-bold text-[#1f2223]">Henry Vance</h4>
                      <p className="text-[10px] text-slate-500 font-medium">Fermentum Co.</p>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* CARD 8: Inverted Split Card with Deep Rounded Corners */}
            {(activeTab === "all" || activeTab === "growth") && (
              <div className={`relative glossy-card rounded-[38px] overflow-hidden hover-lift-card group ${animationsEnabled ? "animate-float-3" : ""}`}>
                <div className="grid grid-cols-5 items-center p-6 sm:p-7 gap-4 relative z-10">
                  
                  {/* Left: Quote */}
                  <div className="col-span-3">
                    <p className="text-xs sm:text-[13px] text-slate-700 leading-relaxed font-medium">
                      &quot;Our team response rates tripled within two weeks of switching to Nxelio&apos;s AI email sequencing.&quot;
                    </p>
                  </div>

                  {/* Right: Circular Avatar & Name */}
                  <div className="col-span-2 flex flex-col items-center text-center bg-slate-50/90 p-3.5 rounded-[26px] border border-slate-100 shadow-inner">
                    <div className="relative w-13 h-13 rounded-full overflow-hidden border-3 border-white shadow-md ring-2 ring-slate-100 mb-2">
                      <Image
                        src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80"
                        alt="Basil Hallward"
                        width={52}
                        height={52}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        unoptimized
                      />
                    </div>
                    <h4 className="text-[11px] font-bold text-[#1f2223] leading-tight">Basil Hallward</h4>
                    <p className="text-[10px] text-slate-500 font-medium">Co-Founder Gravida</p>
                  </div>

                </div>
              </div>
            )}

          </div>

        </div>

        {/* Bottom live stats & satisfaction bar with Curved Pill Shape */}
        <div className="mt-14 sm:mt-18 glossy-card rounded-[36px] p-6 sm:p-8 max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-500 shrink-0 shadow-inner">
              <Star className="w-6.5 h-6.5 fill-amber-400 text-amber-400 animate-star-twinkle drop-shadow-[0_2px_6px_rgba(251,191,36,0.6)]" />
            </div>
            <div>
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <span className="text-xl font-extrabold text-[#1f2223]">4.9 / 5.0</span>
                <div className="flex text-amber-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-400 drop-shadow-[0_1px_3px_rgba(251,191,36,0.4)]" />
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Average rating from 450+ high-growth sales teams &amp; founders.
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
              Join these teams
            </a>
          </div>
        </div>

      </div>
    </section>
  );
}
