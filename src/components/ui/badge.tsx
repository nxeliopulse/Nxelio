import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "success" | "warning" | "danger" | "info" | "outline" | "blue" | "purple" | "pink";

const variants: Record<Variant, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-[#E8F9E8] text-[#1ABE17]",
  warning: "bg-[#FEF8E6] text-[#C98A00]",
  danger: "bg-[#FCE9E6] text-[#E41F07]",
  info: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
  blue: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  purple: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
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
