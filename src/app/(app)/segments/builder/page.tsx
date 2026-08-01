"use client";
import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, X, Save, Users2, AlertCircle } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { createSegment, updateSegment, getSegmentWithRules, previewSegmentCount } from "@/lib/queries/segments";
import { getDistinctLeadValues } from "@/lib/queries/leads";
import { getPicklistCategories } from "@/lib/queries/picklists";
import { getUsers } from "@/lib/queries/users";
import { SEGMENT_FIELDS, operatorsForField, fieldType, isRuleComplete } from "@/lib/segments";

interface Rule {
  id: string;
  field: string;
  operator: string;
  value: string;
}

// Old segments stored display labels / spaced operators — map them to the
// canonical keys the evaluator and dropdowns use so editing them works.
const FIELD_ALIAS: Record<string, string> = {
  Industry: "industry", "Interest Area": "interest_area", "Lead Score": "lead_score", Status: "status", Source: "source",
};
const OP_ALIAS: Record<string, string> = {
  "not equals": "not_equals", "greater than": "gt", "less than": "lt", greater_than: "gt", less_than: "lt",
};
const normField = (f: string) => FIELD_ALIAS[f] || f;
const normOp = (o: string) => OP_ALIAS[o] || o;

export default function SegmentBuilderPage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  // Value-dropdown option sets for fields with a fixed vocabulary (picklists,
  // distinct real values already on leads, or the workspace's owner list) —
  // fetched once on mount so the value input can be a real <select> instead
  // of free text.
  const [picklistValues, setPicklistValues] = useState<Record<string, string[]>>({});
  const [distinctValues, setDistinctValues] = useState<Record<string, string[]>>({});
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      const [categories, source, country, users] = await Promise.all([
        getPicklistCategories(),
        getDistinctLeadValues("source"),
        getDistinctLeadValues("country"),
        getUsers(),
      ]);
      const byKey: Record<string, string[]> = {};
      for (const c of categories) byKey[c.key] = c.values.filter((v) => v.is_active).map((v) => v.value);
      setPicklistValues(byKey);
      setDistinctValues({ source, country });
      setOwners(users.map((u) => ({ id: u.user_id, name: u.full_name })));
    })();
  }, []);

  /** Dropdown options for a rule's value input, or null if this field stays free text. */
  function valueOptionsFor(fieldKey: string): { value: string; label: string }[] | null {
    const f = SEGMENT_FIELDS.find((sf) => sf.key === fieldKey);
    if (!f?.options) return null;
    if (f.options.kind === "picklist") return (picklistValues[f.options.key] || []).map((v) => ({ value: v, label: v }));
    if (f.options.kind === "distinct") return (distinctValues[fieldKey] || []).map((v) => ({ value: v, label: v }));
    if (f.options.kind === "owner") return owners.map((o) => ({ value: o.id, label: o.name }));
    return null;
  }

  // Load an existing segment when opened via ?id= (Edit) so the form shows its
  // real rules instead of the default template.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    (async () => {
      await Promise.resolve();
      setLoading(true);
      setEditId(id);
      try {
        const { segment, rules: saved } = await getSegmentWithRules(id);
        if (segment) {
          setName(segment.segment_name);
          setDescription(segment.description || "");
          setType(segment.segment_type || "Dynamic");
          setLogic(segment.logic_type === "OR" ? "OR" : "AND");
        }
        setRules(
          (saved && saved.length)
            ? saved.map((r: { id: string; field: string; operator: string; value: string | null }, i: number) => ({
                id: String(r.id ?? i),
                field: normField(r.field),
                operator: normOp(r.operator),
                value: r.value ?? "",
              }))
            : []
        );
      } catch {
        setError("Could not load this segment.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
    const payloadRules = rules
      .filter(isRuleComplete)
      .map((r, i) => ({ field: r.field, operator: r.operator, value: r.value, rule_order: i }));
    start(async () => {
      try {
        if (editId) await updateSegment(editId, name.trim(), description, type, payloadRules, logic);
        else await createSegment(name.trim(), description, type, payloadRules, logic);
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
          <p className="text-sm text-slate-500 mt-1">{editId ? "Editing an existing segment" : "Define rules to dynamically group matching leads"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={pending || loading}><Save className="h-4 w-4" /> {pending ? "Saving..." : editId ? "Update segment" : "Save segment"}</Button>
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

            {loading ? (
              <p className="text-sm text-slate-500 py-4">Loading segment…</p>
            ) : rules.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No rules yet — add a condition below.</p>
            ) : (
              <div className="space-y-2.5">
                {rules.map((r, i) => {
                  const f = SEGMENT_FIELDS.find((sf) => sf.key === r.field);
                  const options = valueOptionsFor(r.field);
                  return (
                    <div key={r.id} className="flex items-center gap-2 group">
                      <div className="w-10 text-xs font-semibold text-slate-400 text-right">{i === 0 ? "WHERE" : logic}</div>
                      <Select className="max-w-[180px]" value={r.field} onChange={(e) => changeField(r.id, e.target.value)}>
                        {SEGMENT_FIELDS.map((sf) => <option key={sf.key} value={sf.key}>{sf.label}</option>)}
                      </Select>
                      <Select className="max-w-[160px]" value={r.operator} onChange={(e) => updateRule(r.id, { operator: e.target.value })}>
                        {operatorsForField(r.field).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </Select>
                      {options ? (
                        <Select value={r.value} onChange={(e) => updateRule(r.id, { value: e.target.value })} className="flex-1">
                          <option value="">Select a value...</option>
                          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                      ) : (
                        <Input
                          type={fieldType(r.field) === "number" ? "number" : "text"}
                          value={r.value}
                          onChange={(e) => updateRule(r.id, { value: e.target.value })}
                          placeholder={f?.hint || "Value..."}
                          className="flex-1"
                        />
                      )}
                      <button onClick={() => removeRule(r.id)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"><X className="h-4 w-4" /></button>
                    </div>
                  );
                })}
              </div>
            )}

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
