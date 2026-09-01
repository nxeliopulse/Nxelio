"use client";
import { createContext, useContext } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertStatus = "default" | "success" | "warning" | "error" | "info";

/** Status travels by context so <AlertIndicator /> can pick its own icon and
 *  color without every call site repeating the status on each child. */
const AlertStatusContext = createContext<AlertStatus>("default");

/**
 * Per-status colors.
 *
 * These use explicit hex values (matching src/components/ui/badge.tsx) rather
 * than Tailwind's named ramps on purpose: globals.css remaps `--color-blue-*`
 * and `--color-emerald-600` onto the workspace's chosen accent color, so
 * `bg-blue-50` / `text-emerald-600` would render as teal (or red, or grey —
 * whatever accent is picked in Settings > Appearance) instead of a semantic
 * blue/green. Semantic status colors must stay fixed, so they're pinned here.
 *
 * `default` is the exception and deliberately uses the slate ramp: globals.css
 * inverts slate under dark mode, so it adapts on its own with no dark: variant.
 */
const STATUS_SURFACE: Record<AlertStatus, string> = {
  default: "bg-slate-50 border-slate-200 text-slate-700",
  success: "bg-[#E8F9E8] border-[#BEEFBD] text-[#136B12] dark:bg-[#0E2A15] dark:border-[#1E5B2A] dark:text-[#86EFAC]",
  warning: "bg-[#FEF8E6] border-[#F6E3AE] text-[#8A6100] dark:bg-[#2B2005] dark:border-[#5C4506] dark:text-[#FCD34D]",
  error: "bg-[#FCE9E6] border-[#F6C6BD] text-[#A3160B] dark:bg-[#2C1310] dark:border-[#6B2318] dark:text-[#FCA5A5]",
  info: "bg-[#E6F6FA] border-[#B7E3ED] text-[#0B6675] dark:bg-[#0B2A31] dark:border-[#155E6B] dark:text-[#7DD3E0]",
};

/** Icon tint, kept separate so the icon can stay fully saturated while the
 *  body text sits at a calmer, more readable weight of the same hue. */
const STATUS_ICON: Record<AlertStatus, string> = {
  default: "text-slate-500",
  success: "text-[#1ABE17] dark:text-[#4ADE80]",
  warning: "text-[#C98A00] dark:text-[#FBBF24]",
  error: "text-[#E41F07] dark:text-[#F87171]",
  info: "text-[#0E7C8A] dark:text-[#67E8F9]",
};

const STATUS_ICONS: Record<AlertStatus, typeof Bell> = {
  default: Bell,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info,
};

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  status?: AlertStatus;
  children?: ReactNode;
}

/**
 * Static, inline alert block — for messages that live in the page (a banner
 * above a form, a warning inside a settings card). For transient pop-up
 * messages use `toast()` from @/components/ui/feedback instead.
 */
export function Alert({ status = "default", className, children, role, ...props }: AlertProps) {
  return (
    <AlertStatusContext.Provider value={status}>
      <div
        // Errors and warnings interrupt; the rest are polite announcements.
        role={role ?? (status === "error" || status === "warning" ? "alert" : "status")}
        className={cn(
          "flex items-start gap-3 w-full rounded-xl border px-4 py-3.5",
          STATUS_SURFACE[status],
          className
        )}
        {...props}
      >
        {children}
      </div>
    </AlertStatusContext.Provider>
  );
}

export interface AlertIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  /** Replaces the automatic status icon when you need a specific one. */
  children?: ReactNode;
}

/** The leading status icon. Picks itself from the parent Alert's status. */
export function AlertIndicator({ className, children, ...props }: AlertIndicatorProps) {
  const status = useContext(AlertStatusContext);
  const Icon = STATUS_ICONS[status];
  return (
    <span
      aria-hidden="true"
      className={cn("shrink-0 mt-0.5", STATUS_ICON[status], className)}
      {...props}
    >
      {children ?? <Icon className="h-[18px] w-[18px]" />}
    </span>
  );
}

/** Vertical stack for the title and description. */
export function AlertContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex-1 min-w-0 flex flex-col gap-0.5", className)} {...props} />;
}

export function AlertTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm font-semibold leading-snug", className)} {...props} />;
}

/** Slightly de-emphasised against the title, but inherits the status hue so
 *  the block still reads as one unit. */
export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm leading-relaxed opacity-90", className)} {...props} />;
}
