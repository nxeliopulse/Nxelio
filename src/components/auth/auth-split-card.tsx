import type { ReactNode, CSSProperties, FocusEvent } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { BrandVisualPanel } from "@/components/brand/brand-visual-panel";

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

      <BrandVisualPanel cta={{ label: "Start Your 7-Day Free Trial", href: "/signup" }} />

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
