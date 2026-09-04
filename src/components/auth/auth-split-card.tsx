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
  heading?: [string, string] | string;
  subheading?: string;
  activeAuthTab?: "login" | "signup";
  leftEyebrow?: string;
  leftTitle?: string;
  illustration?: ReactNode;
  children: ReactNode;
}) {
  return (
    // force-dark-theme: this screen's own fixed brand identity (built for it
    // in globals.css, but never actually applied here) — previously it just
    // used bg-white/text-slate-900 with no pin, so it silently rode whatever
    // theme the visitor's OS happened to be in instead of staying constant.
    // That's also what created the QA-reported "jump": dark here (matching
    // an OS dark-mode visitor) into always-light on /terms and /privacy.
    <div className="h-screen w-full flex flex-col lg:flex-row bg-white font-sans overflow-y-auto lg:overflow-hidden force-dark-theme">

      {/* LEFT: form panel — 50% width */}
      <div className="flex-1 flex flex-col justify-between px-6 sm:px-10 lg:px-16 xl:px-24 py-8 relative z-10 lg:w-1/2 shrink-0">
        <Link href="/" className="inline-flex items-center gap-2 mb-4 w-fit shrink-0">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20">
            <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            Nx<span className="text-blue-600">elio</span> <span className="text-slate-500 font-normal">Nurture</span>
          </span>
        </Link>

        <div className="flex-1 flex flex-col justify-center max-w-[400px] w-full mx-auto lg:mx-0 my-auto py-4">
          {activeAuthTab && (
            <div className="flex gap-2 mb-6 w-full p-1 bg-slate-100 rounded-2xl border border-slate-200">
              <Link
                href="/login"
                className={`flex-1 text-center py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeAuthTab === "login" ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className={`flex-1 text-center py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeAuthTab === "signup" ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Sign Up
              </Link>
            </div>
          )}

          {heading && (
            <div className="mb-6">
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
                {Array.isArray(heading) ? heading[0] : heading}
              </h1>
              {subheading && (
                <p className="text-sm text-slate-500 font-normal mt-1.5">
                  {subheading}
                </p>
              )}
            </div>
          )}

          {children}
        </div>

        <p className="text-center text-xs text-slate-500 font-medium pt-4 pb-2 shrink-0">
          &copy; {new Date().getFullYear()} Nxelio Inc. All rights reserved.{" "}
          <Link href="/privacy" className="text-slate-600 hover:text-slate-900 hover:underline transition-colors">Privacy</Link>
          {" "}and{" "}
          <Link href="/terms" className="text-slate-600 hover:text-slate-900 hover:underline transition-colors">Terms</Link>.
        </p>
      </div>

      <BrandVisualPanel cta={{ label: "Start Your 7-Day Free Trial", href: "/signup" }} variant="straight" />

    </div>
  );
}

export const FIELD_LABEL = "block text-sm font-medium text-slate-700 mb-2";

export const UNDERLINE_INPUT = "w-full px-4 py-3 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white";
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
        className="h-3.5 w-3.5 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500 cursor-pointer"
      />
      <span className="text-sm text-slate-600 font-medium">{label}</span>
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
  children,
}: {
  submitLabel: string;
  submitDisabled: boolean;
  switchHref: string;
  switchLabel: string;
  switchLoading?: boolean;
  onSwitchClick?: () => void;
  children?: ReactNode;
}) {
  const isLoginPage = switchHref === "/signup";
  return (
    <div className="space-y-4 pt-2">
      <button
        type="submit"
        disabled={submitDisabled}
        className="w-full py-3.5 px-5 rounded-full text-sm font-bold text-white bg-blue-500 hover:bg-blue-400 active:scale-[0.99] transition-all shadow-lg shadow-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        {submitLabel}
      </button>

      {children}

      <p className="text-center text-sm text-slate-500 font-medium">
        {isLoginPage ? "Don't have an account? " : "Have an account? "}
        <Link
          href={switchHref}
          onClick={onSwitchClick}
          className="font-bold text-blue-600 hover:text-blue-500 hover:underline"
        >
          {isLoginPage ? "Sign up" : "Log in"}
        </Link>
      </p>
    </div>
  );
}
