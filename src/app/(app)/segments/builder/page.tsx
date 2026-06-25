"use client";
import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, X, Save, Users2, AlertCircle } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { createSegment, previewSegmentCount } from "@/lib/queries/segments";
import { SEGMENT_FIELDS, operatorsForField, fieldType, isRuleComplete } from "@/lib/segments";

interface Rule {
  id: string;
  field: string;
  operator: string;
  value: string;
}

export default function SegmentBuilderPage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("High Intent Tech Leads");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("Dynamic");
  const [logic, setLogic] = useState<"AND" | "OR">("AND");
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<Rule[]>([
    { id: "1", field: "industry", operator: "equals", value: "Technology" },
    { id: "2", field: "lead_score", operator: "gt", value: "70" },
  ]);

  // Live preview count — real query against leads, debounced as rules change.
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  useEffect(() => {
    const ready = rules.filter(isRuleComplete);
    const t = setTimeout(async () => {
      if (!ready.length) {
        setCount(0);
        return;
      }
      setCounting(true);
      try {
        const n = await previewSegmentCount(
          ready.map((r) => ({ field: r.field, operator: r.operator, value: r.value })),
          logic
        );
        setCount(n);
      } catch {
        setCount(null);
      } finally {
        setCounting(false);
      }
    }, ready.length ? 400 : 0);
    return () => clearTimeout(t);
  }, [rules, logic]);

  const addRule = () =>
    setRules([...rules, { id: Date.now().toString(), field: "industry", operator: "equals", value: "" }]);
  const removeRule = (id: string) => setRules(rules.filter((r) => r.id !== id));
  const updateRule = (id: string, patch: Partial<Rule>) =>
    setRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Changing the field may invalidate the operator (text vs number sets differ).
  const changeField = (id: string, field: string) => {
    const ops = operatorsForField(field);
    setRules(rules.map((r) => (r.id === id ? { ...r, field, operator: ops.some((o) => o.key === r.operator) ? r.operator : ops[0].key } : r)));
  };

  function handleSave() {
    setError(null);
    if (!name.trim()) { setError("Segment name is required"); return; }
    if (!rules.filter(isRuleComplete).length) { setError("Add at least one complete rule (field, operator and value)."); return; }
    start(async () => {
      try {
        await createSegment(
          name.trim(),
          description,
          type,
          rules.filter(isRuleComplete).map((r, i) => ({ field: r.field, operator: r.operator, value: r.value, rule_order: i })),
          logic
        );
        router.push("/segments");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <div className="max-w-[1600px] mx-auto">
      <Link href="/segments" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to segments
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-2xl font-bold border-transparent bg-transparent !h-auto px-0 hover:bg-slate-50 focus:bg-white focus:px-3 transition-all w-fit min-w-[300px]"
          />
          <p className="text-sm text-slate-500 mt-1">Define rules to dynamically group matching leads</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={pending}><Save className="h-4 w-4" /> {pending ? "Saving..." : "Save segment"}</Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Matching rules</h3>

            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-slate-500">Match leads where</span>
              <div className="flex p-0.5 bg-slate-100 rounded-md">
                {(["AND", "OR"] as const).map((l) => (
                  <button key={l} onClick={() => setLogic(l)}
                    className={`px-3 py-1 rounded text-xs font-semibold ${logic === l ? "bg-white shadow-sm text-blue-700" : "text-slate-600"}`}>
                    {l}
                  </button>
                ))}
              </div>
              <span className="text-sm text-slate-500">of the following match</span>
            </div>

            <div className="space-y-2.5">
              {rules.map((r, i) => {
                const f = SEGMENT_FIELDS.find((sf) => sf.key === r.field);
                return (
                  <div key={r.id} className="flex items-center gap-2 group">
                    <div className="w-10 text-xs font-semibold text-slate-400 text-right">{i === 0 ? "WHERE" : logic}</div>
                    <Select className="max-w-[180px]" value={r.field} onChange={(e) => changeField(r.id, e.target.value)}>
                      {SEGMENT_FIELDS.map((sf) => <option key={sf.key} value={sf.key}>{sf.label}</option>)}
                    </Select>
                    <Select className="max-w-[160px]" value={r.operator} onChange={(e) => updateRule(r.id, { operator: e.target.value })}>
                      {operatorsForField(r.field).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </Select>
                    <Input
                      type={fieldType(r.field) === "number" ? "number" : "text"}
                      value={r.value}
                      onChange={(e) => updateRule(r.id, { value: e.target.value })}
                      placeholder={f?.hint || "Value..."}
                      className="flex-1"
                    />
                    <button onClick={() => removeRule(r.id)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"><X className="h-4 w-4" /></button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={addRule}><Plus className="h-3.5 w-3.5" /> Add condition</Button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Preview</h3>
              <Badge variant={counting ? "warning" : "success"}>{counting ? "Counting…" : "Live"}</Badge>
            </div>
            <div className="text-center py-4">
              <div className="h-12 w-12 mx-auto rounded-xl bg-blue-100 flex items-center justify-center mb-3">
                <Users2 className="h-6 w-6 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900">{count === null ? "—" : count.toLocaleString()}</p>
              <p className="text-sm text-slate-500">matching lead{count === 1 ? "" : "s"}</p>
              <p className="text-xs text-slate-400 mt-2">Real count from your current leads</p>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Segment settings</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Description</label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Type</label>
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="Dynamic">Dynamic (re-evaluate on refresh)</option>
                  <option value="Static">Static (one-time snapshot)</option>
                </Select>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
