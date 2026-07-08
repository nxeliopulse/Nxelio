import { cn } from "@/lib/utils";

/**
 * Nxelio brand mark — a unique linear "growth path" glyph:
 * three connected nodes ascending into an arrowhead, representing
 * lead → nurture → convert. Line-art style (instantly.ai / expandi.io vibe).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* ascending connector line */}
      <path
        d="M6 23 L13 15 L19 19 L26 9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
      {/* arrowhead at the summit */}
      <path
        d="M20.5 9 H26 V14.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* nodes along the path */}
      <circle cx="6" cy="23" r="2.6" fill="white" stroke="currentColor" strokeWidth="2" />
      <circle cx="13" cy="15" r="2.6" fill="white" stroke="currentColor" strokeWidth="2" />
      <circle cx="19" cy="19" r="2.6" fill="white" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 ring-1 ring-white/10">
          <LogoMark className="h-[22px] w-[22px] text-white" />
        </div>
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-bold text-slate-900 text-lg tracking-tight">
            Nxelio
          </span>
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-[0.12em]">AI Engagement</span>
        </div>
      )}
    </div>
  );
}
