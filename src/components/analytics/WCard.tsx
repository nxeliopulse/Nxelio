"use client";
import { GripVertical, MoreHorizontal, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface WCardProps {
  title?: string;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  noPad?: boolean;
  customizing?: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  onRemove?: () => void;
  onMenuClick?: () => void;
  className?: string;
}

/** Extracted from the old analytics-view.tsx's `WCard` — the white/dark card
 *  chrome (title bar + drag handle + hide/menu button) wrapping every widget.
 *  Both dashboard rendering and the builder's live preview use this. */
export function WCard({
  title,
  icon,
  extra,
  children,
  noPad,
  customizing,
  dragging,
  dragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onRemove,
  onMenuClick,
  className,
}: WCardProps) {
  return (
    <div
      draggable={customizing}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver?.(e);
      }}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        "rounded-2xl border transition-all duration-150 relative bg-white dark:bg-[#0c0d24] border-slate-200 dark:border-slate-800/80 shadow-xs hover:shadow-md h-full min-w-0",
        dragOver && "ring-2 ring-[var(--primary)] ring-offset-1",
        dragging && "opacity-40",
        className
      )}
    >
      {title && (
        <div className="flex items-center justify-between px-5 pt-4 pb-2 rounded-t-2xl">
          <div className="flex items-center gap-2 min-w-0">
            {customizing && <GripVertical size={14} className="text-slate-400 flex-shrink-0" />}
            {icon && <span className="text-[var(--primary)]">{icon}</span>}
            <h3 className="text-xs font-bold truncate text-slate-700 dark:text-white uppercase tracking-wide">{title}</h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {extra}
            {customizing && onRemove && (
              <button onClick={onRemove} className="p-1 rounded text-slate-400 hover:text-rose-500" aria-label="Remove widget">
                <EyeOff size={13} />
              </button>
            )}
            {!customizing && onMenuClick && (
              <button onClick={onMenuClick} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" aria-label="Widget options">
                <MoreHorizontal size={14} />
              </button>
            )}
          </div>
        </div>
      )}
      <div className={noPad ? "" : customizing ? "pointer-events-none" : ""}>{children}</div>
    </div>
  );
}
