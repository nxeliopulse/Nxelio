import type { ReactNode, CSSProperties, FocusEvent } from "react";
import Link from "next/link";

/** Shared shell for the redesigned Login/Signup screens — a bordered card
 *  split into a white form panel and a solid-color illustration panel,
 *  matching the reference layout. Each page supplies its own heading,
 *  subheading and illustration since those differ per screen. */
export function AuthSplitCard({
  pageLabel,
  heading,
  subheading,
  illustration,
  children,
}: {
  pageLabel: string;
  heading: [string, string];
  subheading: string;
  illustration: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="force-light-theme min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-5xl">
        <div className="flex items-center gap-1.5 mb-3 px-1">
          <span className="h-2.5 w-2.5 rotate-45 bg-indigo-600 rounded-[2px] flex-shrink-0" />
          <span className="text-sm font-semibold text-indigo-600">{pageLabel}</span>
        </div>

        <div className="rounded-2xl border-2 border-indigo-300 bg-white overflow-hidden flex flex-col lg:flex-row shadow-sm">
          <div className="flex-1 min-w-0 p-8 sm:p-12">
            <div className="max-w-sm">
              <h1 className="text-2xl font-bold text-slate-900 leading-snug mb-1.5">
                <span className="block">{heading[0]}</span>
                <span className="block">{heading[1]}</span>
              </h1>
              <p className="text-xs text-slate-400 mb-8">{subheading}</p>
              {children}
            </div>
          </div>

          <div
            className="hidden lg:flex lg:w-[46%] relative items-center justify-center p-6 overflow-hidden flex-shrink-0"
            style={{ background: "linear-gradient(160deg, #4F5FEF 0%, #3D4FEA 100%)" }}
          >
            <div
              className="absolute inset-0"
              style={{ background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,.10), transparent 55%), radial-gradient(circle at 75% 80%, rgba(255,255,255,.08), transparent 50%)" }}
            />
            <div className="relative z-10 w-full max-w-[420px]">{illustration}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const FIELD_LABEL = "block text-[11px] font-semibold text-indigo-300 mb-1 tracking-wide";

/** Rounded box input style. globals.css has an app-wide
 *  `input:focus, ... { border-color/outline/box-shadow: ... !important }`
 *  rule (added earlier to fix this exact sharp-focus-rectangle problem
 *  everywhere), which no per-component color/shadow style can beat — so
 *  this input doesn't try to. Giving it a real `rounded-lg` is what
 *  actually matters: box-shadow always follows the element's own
 *  border-radius, so that global ring now renders with a curved edge
 *  instead of a hard rectangle. onFocus/onBlur here only swap the
 *  background (untouched by the global rule) for a subtle "lit up" cue. */
export const UNDERLINE_INPUT = "w-full px-3 py-2.5 pr-9 rounded-lg text-sm text-slate-800 placeholder-slate-300 outline-none transition-all";
export const UNDERLINE_INPUT_STYLE: CSSProperties = { background: "#F8FAFC", border: "1.5px solid #E2E8F0", outline: "none" };

export function authInputFocus(e: FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.background = "#FFFFFF";
}
export function authInputBlur(e: FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.background = "#F8FAFC";
}

/** Circular radio-style toggle used for "Remember me" / "I agree…" rows,
 *  matching the reference's ring-and-dot control instead of a checkbox. */
export function RadioToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
        style={{ borderColor: checked ? "#4F5FEF" : "#CBD5E1" }}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />}
      </button>
      <span className="text-xs text-slate-500">{label}</span>
    </label>
  );
}

/** The primary/secondary button pair shared by Sign In and Sign Up — the
 *  reference styles the "switch to the other flow" action as a real button,
 *  not a text link. */
export function AuthButtonRow({
  submitLabel,
  submitDisabled,
  switchHref,
  switchLabel,
}: {
  submitLabel: string;
  submitDisabled: boolean;
  switchHref: string;
  switchLabel: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={submitDisabled}
        className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitLabel}
      </button>
      <Link
        href={switchHref}
        className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 text-center transition-colors"
      >
        {switchLabel}
      </Link>
    </div>
  );
}
