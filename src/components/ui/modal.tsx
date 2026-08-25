"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** "side" slides in from the right edge instead of the centered dialog —
   *  for lighter, single-purpose forms (compose/reply) rather than a full
   *  page-blocking dialog. */
  variant?: "center" | "side";
}

const sizes = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

export function Modal({ open, onClose, title, description, children, size = "md", variant = "center" }: ModalProps) {
  if (!open) return null;
  if (variant === "side") {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="lp-anim-fade fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
        <div className={cn("lp-anim-slide-in relative bg-white h-full w-full shadow-2xl overflow-hidden flex flex-col", sizes[size])}>
          {(title || description) && (
            <div className="p-5 border-b border-slate-100 flex items-start justify-between flex-shrink-0">
              <div>
                {title && <h2 className="font-semibold text-lg text-slate-900">{title}</h2>}
                {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-700 rounded-md p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
          <div className="overflow-auto flex-1">{children}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="lp-anim-fade fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("lp-anim-scale relative bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-h-[90vh] overflow-hidden flex flex-col", sizes[size])}>
        {(title || description) && (
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between">
            <div>
              {title && <h2 className="font-semibold text-lg text-slate-900 dark:text-white">{title}</h2>}
              {description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md p-1 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="overflow-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
