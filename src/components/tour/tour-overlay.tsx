"use client";
import { useEffect, useState, useCallback } from "react";
import { X, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TourStep } from "./tour-types";

interface ActiveTour {
  pageKey: string;
  steps: TourStep[];
  index: number;
}

const RING_PADDING = 8;
const CALLOUT_GAP = 12;
const CALLOUT_WIDTH = 320;
const CALLOUT_HEIGHT_ESTIMATE = 170;
const VIEWPORT_MARGIN = 8;

export function TourOverlay({
  active,
  onNext,
  onBack,
  onSkip,
}: {
  active: ActiveTour | null;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);

  const step = active ? active.steps[active.index] : null;

  // DOM/window reads only ever happen inside this effect (never in the render
  // body) so the component stays pure for SSR and the React Compiler.
  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour-id="${step.id}"]`);
    if (!el) { setRect(null); return; }
    setRect(el.getBoundingClientRect());
    setViewport({ w: window.innerWidth, h: window.innerHeight });
  }, [step]);

  useEffect(() => {
    // No cleared state here on the early-return paths: `step`/`rect` being
    // stale is harmless since the render guard below already returns null
    // whenever `step` or `rect` is falsy — the next real step's measure()
    // call refreshes both.
    if (!step) return;
    const el = document.querySelector(`[data-tour-id="${step.id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    // Give the smooth-scroll a moment to settle before measuring.
    const settleTimer = setTimeout(measure, 300);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(settleTimer);
      ro.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [step, measure]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onSkip();
      else if (e.key === "ArrowRight" || e.key === "Enter") onNext();
      else if (e.key === "ArrowLeft") onBack();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, onNext, onBack, onSkip]);

  if (!active || !step || !rect || !viewport) return null;

  const isLast = active.index === active.steps.length - 1;

  const highlight = {
    top: rect.top - RING_PADDING,
    left: rect.left - RING_PADDING,
    width: rect.width + RING_PADDING * 2,
    height: rect.height + RING_PADDING * 2,
  };

  let placement = step.placement;
  if (!placement) {
    placement = highlight.top + highlight.height + CALLOUT_GAP + CALLOUT_HEIGHT_ESTIMATE > viewport.h ? "top" : "bottom";
  }

  let calloutTop: number;
  let calloutLeft: number;
  if (placement === "top") {
    calloutTop = highlight.top - CALLOUT_GAP - CALLOUT_HEIGHT_ESTIMATE;
    calloutLeft = highlight.left;
  } else if (placement === "left") {
    calloutTop = highlight.top;
    calloutLeft = highlight.left - CALLOUT_GAP - CALLOUT_WIDTH;
  } else if (placement === "right") {
    calloutTop = highlight.top;
    calloutLeft = highlight.left + highlight.width + CALLOUT_GAP;
  } else {
    calloutTop = highlight.top + highlight.height + CALLOUT_GAP;
    calloutLeft = highlight.left;
  }
  calloutLeft = Math.min(Math.max(calloutLeft, VIEWPORT_MARGIN), viewport.w - CALLOUT_WIDTH - VIEWPORT_MARGIN);
  calloutTop = Math.min(Math.max(calloutTop, VIEWPORT_MARGIN), viewport.h - CALLOUT_HEIGHT_ESTIMATE - VIEWPORT_MARGIN);

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Dimmed cutout — 4 rects framing the highlighted element, instead of an
          SVG mask/clip-path (simpler, no cross-browser mask quirks). */}
      <div className="fixed bg-slate-900/50 pointer-events-auto" style={{ top: 0, left: 0, right: 0, height: Math.max(0, highlight.top) }} onClick={onSkip} />
      <div className="fixed bg-slate-900/50 pointer-events-auto" style={{ top: highlight.top + highlight.height, left: 0, right: 0, bottom: 0 }} onClick={onSkip} />
      <div className="fixed bg-slate-900/50 pointer-events-auto" style={{ top: highlight.top, left: 0, width: Math.max(0, highlight.left), height: highlight.height }} onClick={onSkip} />
      <div className="fixed bg-slate-900/50 pointer-events-auto" style={{ top: highlight.top, left: highlight.left + highlight.width, right: 0, height: highlight.height }} onClick={onSkip} />

      {/* Highlight ring around the target */}
      <div
        className="fixed rounded-lg ring-2 ring-[var(--primary)] ring-offset-2 pointer-events-none transition-all duration-200"
        style={{ top: highlight.top, left: highlight.left, width: highlight.width, height: highlight.height }}
      />

      {/* Callout card */}
      <div
        className="fixed rounded-xl shadow-xl bg-white border border-slate-200 p-4 pointer-events-auto transition-all duration-200"
        style={{ top: calloutTop, left: calloutLeft, width: CALLOUT_WIDTH }}
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="font-semibold text-slate-900 text-sm">{step.title}</h3>
          <button onClick={onSkip} className="text-slate-400 hover:text-slate-700 flex-shrink-0 -mt-0.5" title="Skip tour">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-3.5 leading-relaxed">{step.description}</p>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {active.steps.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-all", i === active.index ? "w-4 bg-[var(--primary)]" : "w-1.5 bg-slate-200")} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onSkip} className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-1">Skip</button>
            {active.index > 0 && (
              <Button variant="outline" size="sm" onClick={onBack} title="Back">
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="sm" onClick={onNext}>
              {isLast ? (<>Done <Check className="h-3.5 w-3.5" /></>) : (<>Next <ArrowRight className="h-3.5 w-3.5" /></>)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
