"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldRenderer } from "./field-renderer";
import type { FieldDefinition, SectionDefinition } from "@/core/engine/types";
import { cn } from "@/lib/utils";

export interface FormRendererProps {
  fields?: FieldDefinition[];
  sections?: SectionDefinition[];
  initialValues?: Record<string, any>;
  onSubmit: (values: Record<string, any>) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  isSubmitting?: boolean;
  className?: string;
}

export function FormRenderer({
  fields,
  sections,
  initialValues = {},
  onSubmit,
  onCancel,
  submitLabel = "Save Changes",
  isSubmitting = false,
  className,
}: FormRendererProps) {
  const [formState, setFormState] = useState<Record<string, any>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (fieldName: string, value: any) => {
    setFormState((prev) => ({ ...prev, [fieldName]: value }));
    if (errors[fieldName]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    const allFields = fields || sections?.flatMap((s) => s.fields) || [];
    for (const field of allFields) {
      if (field.required) {
        const val = formState[field.name];
        if (val === undefined || val === null || val === "") {
          newErrors[field.name] = `${field.label} is required`;
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(formState);
  };

  const renderFieldItem = (field: FieldDefinition) => (
    <div key={field.name} className="flex flex-col gap-1.5 min-w-0">
      <label className="text-xs font-semibold text-slate-700 dark:text-slate-600">
        {field.label}
        {field.required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <FieldRenderer
        definition={field}
        value={formState[field.name]}
        mode="edit"
        onChange={(val) => handleFieldChange(field.name, val)}
      />
      {errors[field.name] && (
        <span className="text-xs text-rose-500 font-medium">{errors[field.name]}</span>
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-6", className)}>
      {sections ? (
        sections.map((sec) => (
          <div key={sec.id} className="space-y-3">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-800 border-b border-slate-100 dark:border-slate-800 pb-1.5">
              {sec.title}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sec.fields.map(renderFieldItem)}
            </div>
          </div>
        ))
      ) : fields ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map(renderFieldItem)}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
