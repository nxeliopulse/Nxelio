"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  width?: string;
  footer?: React.ReactNode;
}

/** Right-anchored drawer for build-and-preview workflows (e.g. the report
 *  builder) that need more room than the Modal primitive's max-w-5xl cap and
 *  shouldn't fully block the rest of the screen the way a centered modal does. */
export function Drawer({ open, onClose, title, description, children, width = "560px", footer }: DrawerProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="lp-anim-fade fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative bg-white dark:bg-[#0c0d24] shadow-xl h-full flex flex-col border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-200"
        )}
        style={{ width, maxWidth: "92vw" }}
      >
        {(title || description) && (
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between flex-shrink-0">
            <div>
              {title && <h2 className="font-semibold text-lg text-slate-900 dark:text-white">{title}</h2>}
              {description && <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">{description}</p>}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 rounded-md p-1">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="overflow-auto flex-1">{children}</div>
        {footer && <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
