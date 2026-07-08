import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "success" | "warning" | "danger" | "info" | "outline" | "blue" | "purple" | "pink";

const variants: Record<Variant, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-1 ring-red-200",
  info: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
  blue: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  purple: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  pink: "bg-pink-50 text-pink-700 ring-1 ring-pink-200",
  outline: "border border-slate-200 text-slate-700",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
