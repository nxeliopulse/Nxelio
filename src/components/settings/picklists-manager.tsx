"use client";
import { useState, useTransition } from "react";
import { ChevronUp, ChevronDown, Plus, Trash2, Lock, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import {
  createPicklistValue,
  updatePicklistValue,
  deletePicklistValue,
  reorderPicklistValues,
} from "@/lib/queries/picklists";
import type { PicklistCategoryRow } from "@/lib/picklists";

export function PicklistsManager({ categories }: { categories: PicklistCategoryRow[] }) {
  const { toast, confirm } = useFeedback();
  const [pending, start] = useTransition();
  const [activeId, setActiveId] = useState(categories[0]?.id ?? "");
  const [newValue, setNewValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const active = categories.find((c) => c.id === activeId) ?? categories[0];
  if (!active) return <Card className="p-6 text-sm text-slate-500">No picklists found.</Card>;

  function moveValue(index: number, direction: -1 | 1) {
    const values = [...active.values];
    const target = index + direction;
    if (target < 0 || target >= values.length) return;
    [values[index], values[target]] = [values[target], values[index]];
    start(async () => {
      await reorderPicklistValues(values.map((v) => v.id));
      toast("Order updated.", "success");
    });
  }

  function handleAdd() {
    const value = newValue.trim();
    if (!value) return;
    start(async () => {
      try {
        await createPicklistValue(active.id, value);
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

      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-900">{active.label}</h3>
          {pending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </div>
        <p className="text-sm text-slate-500 mb-4">Values shown here appear in this dropdown across the app — reorder, rename, deactivate, or add new ones.</p>

        <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
          {active.values.map((v, i) => (
            <div key={v.id} className={`flex items-center gap-2 px-3 py-2 ${v.is_active ? "" : "opacity-50"}`}>
              <div className="flex flex-col -my-1">
                <button onClick={() => moveValue(i, -1)} disabled={i === 0} className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => moveValue(i, 1)} disabled={i === active.values.length - 1} className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>

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
          {active.values.length === 0 && <p className="px-3 py-4 text-sm text-slate-400 italic">No values yet — add one below.</p>}
        </div>

        <div className="flex items-center gap-2 mt-3">
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder={`Add a new ${active.label.toLowerCase().replace(/s$/, "")}...`}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <Button size="sm" onClick={handleAdd} disabled={!newValue.trim()}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </Card>
    </div>
  );
}
