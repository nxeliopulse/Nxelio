import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Bare scroll wrapper + table — no border/radius/background of its own, since
 * every current usage nests this inside a Card that already provides those
 * (toolbar + table + pagination as siblings in one Card). Wrap in your own
 * bordered container if you ever need a table that isn't inside a Card.
 */
export function DataTable({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm border-collapse", className)} {...props}>{children}</table>
    </div>
  );
}

export function DataTableHead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-slate-50/70", className)} {...props} />;
}

export function DataTableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export function DataTableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("hover:bg-slate-50/60 transition-colors", className)} {...props} />;
}

export function DataTableTh({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("text-left text-xs font-semibold text-slate-600 px-3.5 py-2.5 border-b border-slate-100 whitespace-nowrap", className)}
      {...props}
    />
  );
}

export function DataTableTd({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3.5 py-3 border-b border-slate-100 text-slate-800", className)} {...props} />;
}

export function DataTableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3.5 py-12 text-center text-sm text-slate-400">
        {children}
      </td>
    </tr>
  );
}
