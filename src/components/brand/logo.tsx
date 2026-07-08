import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Stylized N with ascending data path */}
      <path
        d="M7 24 L7 8 L19 22 L19 8"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Rising accent */}
      <path
        d="M19 15 L26 8"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />
      {/* Summit dot — represents the revenue peak */}
      <circle cx="26" cy="8" r="2.2" fill="white" />
    </svg>
  );
}

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative flex-shrink-0">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#18A7B8] via-[#0e8fa0] to-[#4F46E5] flex items-center justify-center shadow-lg shadow-[#18A7B8]/30 ring-1 ring-white/10">
          <LogoMark className="h-[22px] w-[22px]" />
        </div>
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-bold text-slate-900 text-lg tracking-tight">
            Nx<span className="text-[#18A7B8]">elio</span>
          </span>
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-[0.12em]">
            Turn Leads into Revenue
          </span>
        </div>
      )}
    </div>
  );
}
