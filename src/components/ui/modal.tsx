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
}

const sizes = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

export function Modal({ open, onClose, title, description, children, size = "md" }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="lp-anim-fade fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("lp-anim-scale relative bg-white rounded-xl shadow-xl w-full max-h-[90vh] overflow-hidden flex flex-col", sizes[size])}>
        {(title || description) && (
          <div className="p-5 border-b border-slate-100 flex items-start justify-between">
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
