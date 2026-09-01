import Link from "next/link";
import { ListPlus, Send, Mail, Phone, CheckCircle2 } from "lucide-react";

/** Diagonally-clipped blue panel with a product-preview mockup — shared
 *  across every full-bleed dark screen (Login/Signup, Onboarding) so this
 *  design lives in exactly one place. It used to be copy-pasted per page,
 *  which is exactly how a fabricated testimonial survived one cleanup pass
 *  and reappeared in a duplicate nobody remembered to update. */
export function BrandVisualPanel({
  statHeadline = "100% Real.",
  statBody = "No fabricated reviews, no invented stats — every claim on this page is something we can actually back up.",
  cta,
  variant = "diagonal",
  mockup = true,
}: {
  statHeadline?: string;
  statBody?: string;
  /** Omit entirely on pages where a "start your trial" CTA doesn't make
   *  sense (e.g. onboarding — the user is already a customer). */
  cta?: { label: string; href: string } | null;
  /** "diagonal" (default) is the clipped-wedge Apollo/Clay look used on
   *  Login/Signup. "straight" is a plain rectangular split with the app's
   *  own teal/purple brand gradient — used on Onboarding, which wanted a
   *  calmer, less salesy panel than the auth pages' marketing wedge. */
  variant?: "diagonal" | "straight";
  /** The floating "Live Preview" product-mockup card. Off by default in
   *  "straight" contexts that want a simpler panel; on by default for the
   *  diagonal auth-page look. */
  mockup?: boolean;
}) {
  const straight = variant === "straight";
  const panelClassName = straight
    ? "hidden lg:flex h-full relative items-center justify-center overflow-hidden shrink-0 lg:w-1/2 bg-gradient-to-b from-[#0b63f6] via-[#0243cf] to-[#041a68]"
    : "hidden lg:flex h-full relative items-center justify-center overflow-hidden shrink-0 lg:w-[46%] bg-gradient-to-b from-[#0b63f6] via-[#0243cf] to-[#041a68]";
  return (
    <div
      className={panelClassName}
      style={straight ? undefined : { clipPath: "polygon(18% 0%, 100% 0%, 100% 100%, 0% 100%)" }}
    >
      {/* Dynamic glowing light streaks behind glass card for real backdrop blur */}
      <div className="absolute top-8 right-8 w-96 h-96 bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-500 rounded-full blur-3xl opacity-70 pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-[500px] h-[500px] bg-gradient-to-tr from-blue-700 via-cyan-400 to-sky-200 rounded-full blur-3xl opacity-40 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center px-8 py-8 my-auto">

        {/* Floating product preview card — Sleek Frosted Glass Effect */}
        {mockup && (
          <div className="w-[340px] bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl shadow-[0_30px_70px_rgba(0,10,40,0.25)] p-6 mb-8 text-white relative z-10">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] shadow-xs" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] shadow-xs" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f] shadow-xs" />
              </div>
              <span className="text-xs font-bold text-white bg-white/20 border border-white/10 backdrop-blur-md px-3.5 py-1 rounded-full shadow-sm">
                Live Preview
              </span>
            </div>

            <div className="flex items-center gap-3.5 mb-5">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 border border-white/20 flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-lg">
                AR
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold text-white truncate drop-shadow-xs">Nxlio Nurture</div>
                <div className="text-xs text-white/80 font-medium truncate">VP Basic · Synthetix AI</div>
              </div>
            </div>

            <div className="space-y-2.5 mb-5">
              <div className="flex items-center gap-2.5 text-xs text-white font-medium">
                <Mail className="w-4 h-4 text-white/80 shrink-0" />
                <span className="truncate">alexx@symthotiv.ai</span>
                <span className="ml-auto w-4.5 h-4.5 rounded-full border border-emerald-300/80 flex items-center justify-center bg-emerald-400/30 text-white text-[11px] font-bold shrink-0 shadow-xs">✓</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-white font-medium">
                <Phone className="w-4 h-4 text-white/80 shrink-0" />
                <span>+1 (415) 890-3211</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3.5 border-t border-white/10">
              <button className="flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl py-2.5 backdrop-blur-md transition-all shadow-sm">
                <ListPlus className="w-3.5 h-3.5" /> Add to Sequence
              </button>
              <button className="flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-black/40 hover:bg-black/60 border border-white/5 rounded-xl py-2.5 backdrop-blur-md transition-all shadow-md">
                <Send className="w-3.5 h-3.5" /> Send Email
              </button>
            </div>
          </div>
        )}

        {/* Stat callout — 100% Real. */}
        <div className="text-center">
          <div className={`font-black text-white tracking-tight drop-shadow-md ${straight ? "text-5xl sm:text-6xl" : "text-4xl sm:text-5xl"}`}>
            {statHeadline}
          </div>
          <p className={`mt-3 max-w-sm leading-relaxed ${straight ? "text-sm sm:text-base text-blue-100 font-medium" : "text-xs sm:text-sm text-blue-100 font-medium"}`}>
            {statBody}
          </p>
        </div>

        {cta && (
          <Link
            href={cta.href}
            className="mt-7 inline-flex items-center justify-center px-8 py-3.5 rounded-xl bg-white text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-sm font-extrabold shadow-2xl transition-all hover:scale-[1.02]"
          >
            {cta.label}
          </Link>
        )}

      </div>
    </div>
  );
}
