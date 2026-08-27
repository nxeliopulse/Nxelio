import type { ReactNode, CSSProperties, FocusEvent } from "react";
import Link from "next/link";
import { Zap, ListPlus, Send, Mail, Phone, CheckCircle2 } from "lucide-react";

/** Full-bleed split-screen shell for Login/Signup — no floating card. Left is
 *  a plain dark panel holding the form; right is a diagonally-clipped color
 *  panel with a product preview, matching the Apollo/Clay reference layout
 *  the user asked for (full screen, no card). */
export function AuthSplitCard({
  heading,
  subheading,
  children,
}: {
  pageLabel?: string;
  // Optional — pages that render their own heading as part of `children`
  // (forgot-password, reset-password, check-email, verify-email) omit these
  // and the shell just skips the header block instead of doubling it up.
  heading?: [string, string] | string;
  subheading?: string;
  leftEyebrow?: string;
  leftTitle?: string;
  illustration?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="force-dark-theme min-h-screen w-full flex flex-col lg:flex-row bg-[#0a0a0d] font-sans overflow-hidden">

      {/* LEFT: form panel — full height, no card wrapper */}
      <div className="flex-1 flex flex-col px-6 sm:px-10 lg:px-16 xl:px-24 py-8 lg:py-12 relative z-10">
        <Link href="/" className="inline-flex items-center gap-2 mb-10 lg:mb-16 w-fit">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
            <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">
            Nx<span className="text-blue-400">elio</span> <span className="text-slate-400 font-medium">Nurture</span>
          </span>
        </Link>

        <div className="flex-1 flex flex-col justify-center max-w-[440px] w-full mx-auto lg:mx-0">
          {heading && (
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                {Array.isArray(heading) ? heading[0] : heading}
              </h1>
              {subheading && (
                <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
                  {subheading}
                </p>
              )}
            </div>
          )}

          {children}
        </div>
      </div>

      {/* RIGHT: diagonally-clipped color panel with product preview */}
      <div
        className="hidden lg:flex lg:w-[46%] relative bg-gradient-to-br from-[#1c3db7] via-[#2f60ff] to-[#4338ca] items-center justify-center overflow-hidden"
        style={{ clipPath: "polygon(9% 0%, 100% 0%, 100% 100%, 0% 100%)" }}
      >
        {/* Radiant ambient glow sources */}
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-cyan-400/25 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-indigo-400/25 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center px-10">

          {/* Floating product preview card — a UI mockup, not a customer review */}
          <div className="w-[300px] bg-white rounded-2xl shadow-[0_25px_70px_rgba(10,20,60,0.4)] p-5 mb-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-300" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
              </div>
              <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                Live Preview
              </span>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                AR
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#1f2223] truncate">Alex Rivera</div>
                <div className="text-xs text-slate-500 truncate">VP Sales · Synthetix AI</div>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">alex.r@synthetix.ai</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 ml-auto" />
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>+1 (415) 890-3211</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
              <button className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg py-2 transition-colors">
                <ListPlus className="w-3.5 h-3.5" /> Add to Sequence
              </button>
              <button className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-white bg-[#1f2223] hover:bg-black rounded-lg py-2 transition-colors">
                <Send className="w-3.5 h-3.5" /> Send Email
              </button>
            </div>
          </div>

          {/* Honest stat callout — no fabricated numbers */}
          <div className="text-center">
            <div className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
              100% Real.
            </div>
            <p className="text-sm sm:text-base text-blue-100 mt-3 max-w-sm leading-relaxed">
              No fabricated reviews, no invented stats — every claim on this page is something we can actually back up.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}

export const FIELD_LABEL = "block text-xs font-bold text-slate-300 mb-1.5 tracking-normal";

export const UNDERLINE_INPUT = "w-full px-4 py-3 rounded-xl text-sm text-white placeholder:text-slate-500 outline-none transition-all border border-white/15 focus:border-blue-400 focus:ring-4 focus:ring-blue-400/15 bg-white/[0.06] backdrop-blur-sm";
export const UNDERLINE_INPUT_STYLE: CSSProperties = {};

export function authInputFocus(e: FocusEvent<HTMLInputElement>) {}
export function authInputBlur(e: FocusEvent<HTMLInputElement>) {}

/** Checkbox toggle used for "Remember me" / "I agree…" rows */
export function RadioToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-white/25 bg-white/10 text-blue-500 focus:ring-blue-400 cursor-pointer"
      />
      <span className="text-xs text-slate-400 font-medium">{label}</span>
    </label>
  );
}

/** The primary action button and switch-flow link pair */
export function AuthButtonRow({
  submitLabel,
  submitDisabled,
  switchHref,
  switchLabel,
  switchLoading,
  onSwitchClick,
}: {
  submitLabel: string;
  submitDisabled: boolean;
  switchHref: string;
  switchLabel: string;
  switchLoading?: boolean;
  onSwitchClick?: () => void;
}) {
  const isLoginPage = switchHref === "/signup";
  return (
    <div className="space-y-3">
      <button
        type="submit"
        disabled={submitDisabled}
        className="w-full py-3.5 px-6 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.99] transition-all shadow-md shadow-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        {submitLabel}
      </button>

      <p className="text-center text-xs text-slate-400 font-medium">
        {isLoginPage ? "Don't have an account? " : "Have an account? "}
        <Link
          href={switchHref}
          onClick={onSwitchClick}
          className="font-bold text-blue-400 hover:text-blue-300 hover:underline"
        >
          {isLoginPage ? "Sign up" : "Log in"}
        </Link>
      </p>
    </div>
  );
}
