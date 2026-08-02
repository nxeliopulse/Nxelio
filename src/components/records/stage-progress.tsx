"use client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StageStep = { value: string; label: string };

// Generic horizontal pipeline/stage progress bar. Takes a plain list of
// {value,label} steps and the current value — no entity-specific knowledge,
// so it works unchanged whether the caller passes today's hardcoded
// OPPORTUNITY_STAGES or, later, a metadata-driven pipeline.stages list.
export function StageProgress({
  steps,
  currentValue,
  onSelect,
  disabled,
}: {
  steps: StageStep[];
  currentValue: string;
  onSelect?: (value: string) => void;
  disabled?: boolean;
}) {
  const currentIndex = steps.findIndex((s) => s.value === currentValue);

  return (
    <div className="flex items-center w-full">
      {steps.map((step, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
        return (
          <button
            key={step.value}
            type="button"
            disabled={disabled || !onSelect}
            onClick={() => onSelect?.(step.value)}
            className={cn(
              "relative flex-1 h-9 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors first:rounded-l-lg last:rounded-r-lg",
              state === "done" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
              state === "current" && "bg-blue-600 text-white",
              state === "upcoming" && "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
              onSelect && !disabled && "cursor-pointer hover:opacity-90",
              (disabled || !onSelect) && "cursor-default"
            )}
          >
            {state === "done" && <Check className="h-3.5 w-3.5" />}
            <span className="truncate px-1">{step.label}</span>
          </button>
        );
      })}
    </div>
  );
}
