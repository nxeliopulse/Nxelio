"use client";

import React, { useState } from "react";
import { Mail, Phone, ExternalLink, Calendar, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { FieldDefinition } from "@/core/engine/types";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import { PhoneInput, detectCountry, formatPhoneForStorage, type CountryCode } from "@/components/ui/phone-input";

/** Custom "phone" fields have no separate column to persist a selected
 *  country in — only the single string value FieldRenderer already stores.
 *  detectCountry() re-derives a sensible starting country from that stored
 *  value on every mount, so no schema change is needed to get country-code
 *  support here. Formats to international form onBlur (not on every
 *  keystroke) so reformatting mid-type doesn't fight the cursor. */
function PhoneFieldEditor({ value, onChange, disabled, className }: { value: string; onChange?: (v: string) => void; disabled?: boolean; className?: string }) {
  const [country, setCountry] = useState<CountryCode>(() => detectCountry(value));
  return (
    <PhoneInput
      label=""
      country={country}
      value={value}
      onCountryChange={setCountry}
      onValueChange={(v) => onChange?.(v)}
      inputClassName={cn("flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400", disabled && "opacity-60 pointer-events-none", className)}
    />
  );
}

function formatCurrency(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "₹0";
  return "₹" + Math.round(num).toLocaleString("en-IN");
}

export interface FieldRendererProps {
  definition: FieldDefinition;
  value: any;
  mode?: "view" | "edit" | "inline";
  onChange?: (newValue: any) => void;
  className?: string;
}

export function FieldRenderer({
  definition,
  value,
  mode = "view",
  onChange,
  className,
}: FieldRendererProps) {
  const isEditing = mode === "edit";

  if (isEditing) {
    switch (definition.type) {
      case "phone":
        return (
          <PhoneFieldEditor
            value={value ?? ""}
            onChange={onChange}
            disabled={definition.readOnly}
            className={className}
          />
        );
      case "text":
      case "email":
      case "url":
        return (
          <Input
            type={definition.type === "email" ? "email" : "text"}
            value={value ?? ""}
            placeholder={definition.placeholder || definition.label}
            onChange={(e) => onChange?.(e.target.value)}
            disabled={definition.readOnly}
            className={className}
          />
        );
      case "number":
      case "currency":
        return (
          <Input
            type="number"
            value={value ?? ""}
            placeholder={definition.placeholder || definition.label}
            onChange={(e) => onChange?.(e.target.value ? parseFloat(e.target.value) : null)}
            disabled={definition.readOnly}
            className={className}
          />
        );
      case "date":
      case "datetime":
        return (
          <Input
            type={definition.type === "date" ? "date" : "datetime-local"}
            value={value ?? ""}
            onChange={(e) => onChange?.(e.target.value)}
            disabled={definition.readOnly}
            className={className}
          />
        );
      case "picklist":
      case "badge":
        return (
          <select
            value={value ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value)}
            disabled={definition.readOnly}
            className={cn(
              "flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-800",
              className
            )}
          >
            <option value="">Select {definition.label}</option>
            {definition.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      case "checkbox":
        return (
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-600">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange?.(e.target.checked)}
              disabled={definition.readOnly}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>{definition.label}</span>
          </label>
        );
      default:
        return (
          <Input
            value={value ?? ""}
            onChange={(e) => onChange?.(e.target.value)}
            disabled={definition.readOnly}
            className={className}
          />
        );
    }
  }

  // Display Mode ("view")
  if (value === null || value === undefined || value === "") {
    return <span className="text-sm text-slate-400 dark:text-slate-500 font-normal">—</span>;
  }

  switch (definition.type) {
    case "currency":
      return (
        <span className={cn("text-sm font-medium text-slate-900 dark:text-slate-800", className)}>
          {formatCurrency(value)}
        </span>
      );

    case "number":
      return (
        <span className={cn("text-sm font-medium text-slate-900 dark:text-slate-800", className)}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
      );

    case "email":
      return (
        <a
          href={`mailto:${value}`}
          className={cn("inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400", className)}
        >
          <Mail className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{value}</span>
        </a>
      );

    case "phone":
      return (
        <a
          href={`tel:${value}`}
          className={cn("inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400", className)}
        >
          <Phone className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{value}</span>
        </a>
      );

    case "url":
    case "link":
      return (
        <a
          href={value.startsWith("http") ? value : `https://${value}`}
          target="_blank"
          rel="noreferrer"
          className={cn("inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400", className)}
        >
          <span className="truncate">{value}</span>
          <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
        </a>
      );

    case "date":
      return (
        <span className={cn("inline-flex items-center gap-1 text-sm text-slate-700 dark:text-slate-600", className)}>
          <Calendar className="h-3.5 w-3.5 text-slate-400" />
          {formatDate(value)}
        </span>
      );

    case "datetime":
      return (
        <span className={cn("text-sm text-slate-700 dark:text-slate-600", className)}>
          {formatDateTime(value)}
        </span>
      );

    case "badge":
    case "picklist": {
      const matchOpt = definition.options?.find((o) => o.value === value || o.label === value);
      const variant = matchOpt?.variant || "default";
      return (
        <Badge variant={variant} className={className}>
          {matchOpt?.label || value}
        </Badge>
      );
    }

    case "checkbox":
      return (
        <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", value ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400")}>
          {value ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {value ? "Yes" : "No"}
        </span>
      );

    default:
      return (
        <span className={cn("text-sm text-slate-900 dark:text-slate-800", className)}>
          {String(value)}
        </span>
      );
  }
}
