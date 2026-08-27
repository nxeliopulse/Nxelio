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
  activeAuthTab,
  children,
}: {
  pageLabel?: string;
  // Optional — pages that render their own heading as part of `children`
  // (forgot-password, reset-password, check-email, verify-email) omit these
  // and the shell just skips the header block instead of doubling it up.
  heading?: [string, string] | string;
  subheading?: string;
  // Only Login/Signup pass this — it's what shows the Log In / Sign Up
  // toggle pills. The password-reset/verification flows don't have a
  // "sign up instead" equivalent, so they simply omit it.
  activeAuthTab?: "login" | "signup";
  leftEyebrow?: string;
  leftTitle?: string;
  illustration?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="force-dark-theme h-screen w-full flex flex-col lg:flex-row bg-[#0a0a0d] font-sans overflow-y-auto lg:overflow-hidden">

      {/* LEFT: form panel — full height, compact padding to eliminate scrolling */}
      <div className="flex-1 flex flex-col justify-between px-6 sm:px-10 lg:px-14 xl:px-20 py-5 lg:py-6 relative z-10">
        <Link href="/" className="inline-flex items-center gap-2 mb-3 lg:mb-4 w-fit shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
            <Zap className="w-3.5 h-3.5 text-white fill-white" />
          </div>
          <span className="text-base font-bold tracking-tight text-white">
            Nx<span className="text-blue-400">elio</span> <span className="text-slate-400 font-medium">Nurture</span>
          </span>
        </Link>

        <div className="flex-1 flex flex-col justify-center max-w-[420px] w-full mx-auto lg:mx-0 my-auto">
          {activeAuthTab && (
            <div className="flex gap-2 mb-4 w-full">
              <Link
                href="/login"
                className={`flex-1 text-center py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                  activeAuthTab === "login" ? "bg-white text-[#0a0a0d]" : "text-slate-400 hover:text-white border border-white/15"
                }`}
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className={`flex-1 text-center py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                  activeAuthTab === "signup" ? "bg-white text-[#0a0a0d]" : "text-slate-400 hover:text-white border border-white/15"
                }`}
              >
                Sign Up
              </Link>
            </div>
          )}

          {heading && (
            <div className="mb-3.5">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-tight">
                {Array.isArray(heading) ? heading[0] : heading}
              </h1>
              {subheading && (
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  {subheading}
                </p>
              )}
            </div>
          )}

          {children}
        </div>

        <p className="text-center text-[11px] text-slate-500 font-medium pt-3 shrink-0">
          &copy; {new Date().getFullYear()} Nxelio Inc. All rights reserved.{" "}
          <Link href="/privacy" className="hover:text-slate-300 hover:underline">Privacy</Link>
          {" "}and{" "}
          <Link href="/terms" className="hover:text-slate-300 hover:underline">Terms</Link>.
        </p>
      </div>

      {/* RIGHT: diagonally-clipped color panel with product preview */}
      <div
        className="hidden lg:flex lg:w-[46%] h-full relative bg-gradient-to-br from-[#1447e6] via-[#2563eb] to-[#1e2fc4] items-center justify-center overflow-hidden shrink-0"
        style={{ clipPath: "polygon(22% 0%, 100% 0%, 100% 100%, 0% 100%)" }}
      >
        {/* Radiant ambient glow sources */}
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-blue-400/35 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-blue-500/35 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center px-8 py-6 my-auto">

          {/* Floating product preview card */}
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

          {/* Stat callout */}
          <div className="text-center">
            <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              100% Real.
            </div>
            <p className="text-xs sm:text-sm text-blue-100 mt-2 max-w-xs leading-relaxed">
              No fabricated reviews, no invented stats — every claim on this page is something we can actually back up.
            </p>
          </div>

          <Link
            href="/signup"
            className="mt-5 inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[#0a0a0d] hover:bg-black text-white text-xs sm:text-sm font-bold shadow-lg transition-all hover:scale-[1.02]"
          >
            Start Your 7-Day Free Trial
          </Link>

        </div>
      </div>

    </div>
  );
}

export const FIELD_LABEL = "block text-xs font-bold text-slate-300 mb-1 tracking-normal";

export const UNDERLINE_INPUT = "w-full px-3.5 py-2.5 rounded-lg text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none transition-all border border-white/15 focus:border-blue-400 focus:ring-4 focus:ring-blue-400/15 bg-white/[0.06] backdrop-blur-sm";
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
        className="h-3.5 w-3.5 rounded border-white/25 bg-white/10 text-blue-500 focus:ring-blue-400 cursor-pointer"
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
    <div className="space-y-2">
      <button
        type="submit"
        disabled={submitDisabled}
        className="w-full py-2.5 sm:py-3 px-5 rounded-lg text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.99] transition-all shadow-md shadow-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
