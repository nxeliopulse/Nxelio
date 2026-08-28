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
    ? "hidden lg:flex h-full relative items-center justify-center overflow-hidden shrink-0 lg:w-[42%] rounded-2xl bg-gradient-to-br from-[#1447e6] via-[#2563eb] to-[#1e2fc4]"
    : "hidden lg:flex h-full relative items-center justify-center overflow-hidden shrink-0 lg:w-[46%] bg-gradient-to-br from-[#1447e6] via-[#2563eb] to-[#1e2fc4]";
  return (
    <div
      className={panelClassName}
      style={straight ? undefined : { clipPath: "polygon(22% 0%, 100% 0%, 100% 100%, 0% 100%)" }}
    >
      {/* Radiant ambient glow sources */}
      <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-white/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center px-8 py-6 my-auto">

        {/* Floating product preview card — a UI mockup, not a customer review */}
        {mockup && (
          <div className="w-[280px] bg-white rounded-xl shadow-[0_20px_50px_rgba(10,20,60,0.35)] p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-300" />
                <span className="w-2 h-2 rounded-full bg-amber-300" />
                <span className="w-2 h-2 rounded-full bg-emerald-300" />
              </div>
              <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                Live Preview
              </span>
            </div>

            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                AR
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#1f2223] truncate">Alex Rivera</div>
                <div className="text-[11px] text-slate-500 truncate">VP Sales · Synthetix AI</div>
              </div>
            </div>

            <div className="space-y-1.5 mb-3">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate text-[11px]">alex.r@synthetix.ai</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 ml-auto" />
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-[11px]">+1 (415) 890-3211</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-100">
              <button className="flex items-center justify-center gap-1 text-[10px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg py-1.5 transition-colors">
                <ListPlus className="w-3 h-3" /> Add to Sequence
              </button>
              <button className="flex items-center justify-center gap-1 text-[10px] font-semibold text-white bg-[#1f2223] hover:bg-black rounded-lg py-1.5 transition-colors">
                <Send className="w-3 h-3" /> Send Email
              </button>
            </div>
          </div>
        )}

        {/* Stat callout */}
        <div className="text-center">
          <div className={`font-extrabold text-white tracking-tight ${straight ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"}`}>
            {statHeadline}
          </div>
          <p className={`mt-3 max-w-xs leading-relaxed ${straight ? "text-sm sm:text-base text-white/85" : "text-xs sm:text-sm text-blue-100"}`}>
            {statBody}
          </p>
        </div>

        {cta && (
          <Link
            href={cta.href}
            className="mt-5 inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[#0a0a0d] hover:bg-black text-white text-xs sm:text-sm font-bold shadow-lg transition-all hover:scale-[1.02]"
          >
            {cta.label}
          </Link>
        )}

      </div>
    </div>
  );
}
