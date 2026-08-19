"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FieldRenderer } from "./field-renderer";
import type { SectionDefinition, FieldDefinition } from "@/core/engine/types";
import { cn } from "@/lib/utils";

export interface RecordSectionProps {
  section: SectionDefinition;
  record: Record<string, unknown>;
  mode?: "view" | "edit";
  onChangeField?: (fieldName: string, value: unknown) => void;
  className?: string;
}

export function RecordSection({
  section,
  record,
  mode = "view",
  onChangeField,
  className,
}: RecordSectionProps) {
  const columns = section.columns || 2;
  const gridColsClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 3
      ? "grid-cols-1 md:grid-cols-3"
      : columns === 4
      ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
      : "grid-cols-1 md:grid-cols-2";

  return (
    <Card className={cn("border border-slate-200 dark:border-slate-800 shadow-xs mb-4", className)}>
      {section.title && (
        <CardHeader className="py-3.5 px-4 sm:px-5 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-[var(--muted)]">
          <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-700">
            {section.title}
          </CardTitle>
          {section.description && (
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
              {section.description}
            </p>
          )}
        </CardHeader>
      )}
      <CardContent className="p-4 sm:p-5">
        <div className={cn("grid gap-4 sm:gap-6", gridColsClass)}>
          {section.fields.map((field) => {
            const fieldValue = record[field.name];
            return (
              <div key={field.name} className="flex flex-col gap-1 min-w-0">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide dark:text-slate-500">
                  {field.label}
                  {field.required && <span className="text-rose-500 ml-0.5">*</span>}
                </span>
                <div className="min-w-0">
                  <FieldRenderer
                    definition={field}
                    value={fieldValue}
                    mode={mode}
                    onChange={(val) => onChangeField?.(field.name, val)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
