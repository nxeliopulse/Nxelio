"use client";

import React, { useState, useTransition, useEffect } from "react";
import { Plus, Layers, Trash2, MoveVertical, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CRMObjectRegistry, getObjectSchema } from "@/core/engine/registry";
import type { FieldDefinition, FieldDataType } from "@/core/engine/types";
import { FieldRenderer } from "@/components/records/field-renderer";
import { useFeedback } from "@/components/ui/feedback";
import { saveCustomFieldDefinition, deleteCustomFieldDefinition, getCustomFieldDefinitions } from "@/lib/queries/custom-fields";

export function CustomFieldsBuilder() {
  const { toast } = useFeedback();
  const [, startTransition] = useTransition();
  const [selectedObject, setSelectedObject] = useState<string>("lead");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldDataType>("text");
  const [newRequired, setNewRequired] = useState(false);
  const [newOptionsText, setNewOptionsText] = useState("");

  const schema = getObjectSchema(selectedObject) || CRMObjectRegistry.lead;
  const [fields, setFields] = useState<FieldDefinition[]>(Object.values(schema.fields));

  // Sync schema fields when object selection changes. Not a pure derivation
  // (handleAddField accumulates local, unsaved fields on top of the schema
  // baseline), so switching objects needs to reset that local list back to
  // the new object's schema fields.
  useEffect(() => {
    const targetSchema = getObjectSchema(selectedObject);
    if (targetSchema) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets local unsaved field edits when the selected object changes
      setFields(Object.values(targetSchema.fields));
    }
  }, [selectedObject]);

  const handleSelectObject = (objKey: string) => {
    setSelectedObject(objKey);
  };

  const handleAddField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName.trim() || !newFieldLabel.trim()) {
      toast("Field name and label are required.", "error");
      return;
    }

    const fieldKey = newFieldName.toLowerCase().replace(/[^a-z0-9_]/g, "_");

    const options = newOptionsText.trim()
      ? newOptionsText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((val) => ({ label: val, value: val }))
      : undefined;

    const newField: FieldDefinition = {
      name: fieldKey,
      label: newFieldLabel.trim(),
      type: newFieldType,
      required: newRequired,
      options,
    };

    setFields((prev) => [...prev, newField]);

    // Persist custom field definition via backend service
    startTransition(async () => {
      try {
        await saveCustomFieldDefinition(selectedObject, newField);
        toast(`Custom field "${newField.label}" saved to ${schema.singularLabel} backend schema.`, "success");
      } catch (err) {
        toast(`Added field locally (backend sync notice).`, "info");
      }
    });

    // Reset form
    setNewFieldName("");
    setNewFieldLabel("");
    setNewFieldType("text");
    setNewRequired(false);
    setNewOptionsText("");
    setShowAddModal(false);
  };

  const handleDeleteField = (fieldName: string) => {
    setFields((prev) => prev.filter((f) => f.name !== fieldName));
    startTransition(async () => {
      await deleteCustomFieldDefinition(selectedObject, fieldName);
      toast(`Field removed from ${schema.singularLabel} schema.`, "success");
    });
  };

  return (
    <div className="space-y-6">
      {/* Object Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Object Schema & Custom Fields</h3>
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Customize backend enterprise fields and layout definitions for your CRM entities.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {Object.values(CRMObjectRegistry).map((obj) => (
            <Button
              key={obj.objectType}
              variant={selectedObject === obj.objectType ? "primary" : "outline"}
              size="sm"
              onClick={() => handleSelectObject(obj.objectType)}
              className="text-xs font-semibold"
            >
              {obj.pluralLabel}
            </Button>
          ))}
        </div>
      </div>

      {/* Main Grid: Field Schema List vs Real-Time Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Schema Field Definitions (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="border border-slate-200 dark:border-slate-800">
            <CardHeader className="py-3.5 px-4 flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-700">
                {schema.pluralLabel} Fields ({fields.length})
              </CardTitle>
              <Button size="sm" onClick={() => setShowAddModal(true)} className="h-8 text-xs gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Custom Field
              </Button>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800">
              {fields.map((field) => (
                <div key={field.name} className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-[var(--muted)]">
                  <div className="flex items-center gap-3 min-w-0">
                    <MoveVertical className="h-4 w-4 text-slate-300 dark:text-slate-600 cursor-move" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-800 truncate">
                          {field.label}
                        </span>
                        {field.required && <Badge variant="danger" className="text-[10px] py-0 px-1">Required</Badge>}
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Key: {field.name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="blue" className="text-xs uppercase">
                      {field.type}
                    </Badge>
                    <button
                      onClick={() => handleDeleteField(field.name)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      title="Delete Field"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live Field Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="border border-slate-200 dark:border-slate-800">
            <CardHeader className="py-3.5 px-4 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-700">
                Live Layout Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {fields.map((field) => (
                <div key={field.name} className="flex flex-col gap-1 min-w-0">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide dark:text-slate-500">
                    {field.label}
                    {field.required && <span className="text-rose-500 ml-0.5">*</span>}
                  </span>
                  <FieldRenderer
                    definition={field}
                    value={
                      field.type === "currency"
                        ? 250000
                        : field.type === "picklist"
                        ? field.options?.[0]?.value || "New"
                        : field.type === "email"
                        ? "demo@example.com"
                        : field.type === "phone"
                        ? "+1 (555) 019-2834"
                        : "Sample " + field.label
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Custom Field Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Add Custom Field to {schema.singularLabel}
            </h3>

            <form onSubmit={handleAddField} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-600">Field Label</label>
                <Input
                  value={newFieldLabel}
                  onChange={(e) => {
                    setNewFieldLabel(e.target.value);
                    if (!newFieldName) setNewFieldName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
                  }}
                  placeholder="e.g. Preferred Contact Time"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-600">Field Key (API Name)</label>
                <Input
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder="e.g. preferred_contact_time"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-600">Data Type</label>
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value as FieldDataType)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="currency">Currency</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="url">URL Link</option>
                  <option value="date">Date</option>
                  <option value="picklist">Picklist Dropdown</option>
                  <option value="checkbox">Checkbox (Yes/No)</option>
                </select>
              </div>

              {newFieldType === "picklist" && (
                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-600">Dropdown Options (One per line)</label>
                  <textarea
                    rows={3}
                    value={newOptionsText}
                    onChange={(e) => setNewOptionsText(e.target.value)}
                    placeholder="Option 1&#10;Option 2&#10;Option 3"
                    className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs focus:ring-2 focus:ring-blue-500 dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newRequired}
                  onChange={(e) => setNewRequired(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Require value for this field
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  Save Field
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
