"use client";
import { useState, useTransition, useRef } from "react";
import { GripVertical, Plus, Trash2, Lock, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import {
  createPicklistValue,
  updatePicklistValue,
  deletePicklistValue,
  reorderPicklistValues,
} from "@/lib/queries/picklists";
import type { PicklistCategoryRow, PicklistValueRow } from "@/lib/picklists";

export function PicklistsManager({ categories }: { categories: PicklistCategoryRow[] }) {
  const [activeId, setActiveId] = useState(categories[0]?.id ?? "");
  const active = categories.find((c) => c.id === activeId) ?? categories[0];

  if (!active) return <Card className="p-6 text-sm text-slate-500">No picklists found.</Card>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
      <Card className="p-2 h-fit">
        <ul className="space-y-0.5">
          {categories.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setActiveId(c.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  c.id === activeId ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {c.label}
                <span className="ml-1.5 text-xs text-slate-400">({c.values.filter((v) => v.is_active).length})</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {/* Keyed by category id — switching categories mounts a fresh instance,
          so its local (optimistic drag order, edit state) resets naturally
          without needing an effect to sync it. */}
      <CategoryValues key={active.id} category={active} />
    </div>
  );
}

function CategoryValues({ category }: { category: PicklistCategoryRow }) {
  const { toast, confirm } = useFeedback();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<PicklistValueRow[]>(category.values);
  const [newValue, setNewValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function persistOrder(next: PicklistValueRow[]) {
    setValues(next);
    start(async () => {
      await reorderPicklistValues(next.map((v) => v.id));
      toast("Order updated.", "success");
    });
  }

  function handleDrop(targetIndex: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    setOverIndex(null);
    if (from === null || from === targetIndex) return;
    const next = [...values];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    persistOrder(next);
  }

  function handleAdd() {
    const value = newValue.trim();
    if (!value) return;
    start(async () => {
      try {
        await createPicklistValue(category.id, value);
        setNewValue("");
        toast(`Added "${value}".`, "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Couldn't add value.", "error");
      }
    });
  }

  function handleSaveEdit(id: string) {
    const value = editingText.trim();
    if (!value) return;
    start(async () => {
      try {
        await updatePicklistValue(id, { value });
        setEditingId(null);
        toast("Value updated.", "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Couldn't update value.", "error");
      }
    });
  }

  function handleToggleActive(id: string, isActive: boolean) {
    start(async () => { await updatePicklistValue(id, { is_active: !isActive }); });
  }

  async function handleDelete(id: string, value: string) {
    if (!(await confirm({ title: "Delete value?", message: `Delete "${value}"? Leads that already have this value keep it, but it won't be offered for new selections.`, confirmLabel: "Delete", danger: true }))) return;
    start(async () => {
      try {
        await deletePicklistValue(id);
        toast(`Deleted "${value}".`, "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Couldn't delete value.", "error");
      }
    });
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-slate-900">{category.label}</h3>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>
      <p className="text-sm text-slate-500 mb-4">Values shown here appear in this dropdown across the app — drag to reorder, rename, deactivate, or add new ones.</p>

      <div className="border border-slate-100 rounded-lg overflow-hidden">
        {values.map((v, i) => (
          <div
            key={v.id}
            draggable
            onDragStart={() => { dragIndex.current = i; }}
            onDragOver={(e) => { e.preventDefault(); if (overIndex !== i) setOverIndex(i); }}
            onDragEnd={() => { dragIndex.current = null; setOverIndex(null); }}
            onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
            className={`flex items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0 bg-white ${v.is_active ? "" : "opacity-50"} ${
              overIndex === i ? "border-t-2 border-t-blue-400" : ""
            }`}
          >
            <span className="cursor-grab active:cursor-grabbing p-0.5 text-slate-300 hover:text-slate-500" title="Drag to reorder">
              <GripVertical className="h-4 w-4" />
            </span>

            <div className="flex-1 min-w-0">
              {editingId === v.id ? (
                <input
                  autoFocus
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(v.id); if (e.key === "Escape") setEditingId(null); }}
                  onBlur={() => handleSaveEdit(v.id)}
                  className="w-full rounded-md border border-blue-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              ) : (
                <button
                  onClick={() => { setEditingId(v.id); setEditingText(v.value); }}
                  disabled={v.is_system}
                  className="text-sm text-slate-800 hover:text-blue-600 disabled:hover:text-slate-800 text-left truncate"
                >
                  {v.value}
                </button>
              )}
            </div>

            {v.is_system && (
              <span title="System value — set automatically by the app, can't be renamed or deleted" className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                <Lock className="h-3 w-3" /> System
              </span>
            )}

            <button
              onClick={() => handleToggleActive(v.id, v.is_active)}
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${v.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
            >
              {v.is_active ? "Active" : "Inactive"}
            </button>

            <button
              onClick={() => handleDelete(v.id, v.value)}
              disabled={v.is_system}
              className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-slate-400"
              title={v.is_system ? "System value can't be deleted" : "Delete"}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {values.length === 0 && <p className="px-3 py-4 text-sm text-slate-400 italic">No values yet — add one below.</p>}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder={`Add a new ${category.label.toLowerCase().replace(/s$/, "")}...`}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <Button size="sm" onClick={handleAdd} disabled={!newValue.trim()}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </Card>
  );
}
