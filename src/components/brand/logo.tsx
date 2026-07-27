import { cn } from "@/lib/utils";

/**
 * Nxelio Nurture brand mark — the actual logo asset (navy folded-cover
 * glyph with an orange focal square and motion dashes), not a recreation.
 * Has its own opaque white background baked in, so wrap it in a white
 * (not colored/translucent) badge wherever it's placed on a dark surface.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed-size brand mark used at many arbitrary sizes via className; not worth Next/Image's fill/sizing constraints
    <img
      src="/image.png"
      alt="Nxelio Nurture"
      width={460}
      height={453}
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative">
        <div className="h-9 w-9 rounded-xl overflow-hidden shadow-lg shadow-slate-900/15 ring-1 ring-slate-900/5 bg-white flex items-center justify-center">
          <LogoMark className="h-full w-full" />
        </div>
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-bold text-slate-900 text-lg tracking-tight">
            Nxelio Nurture
          </span>
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-[0.12em]">AI-Powered Lead Nurturing</span>
        </div>
      )}
    </div>
  );
}
