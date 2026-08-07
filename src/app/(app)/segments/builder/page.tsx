"use client";
import { useState, useTransition, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  X,
  Save,
  Users2,
  AlertCircle,
  ShieldOff,
  Sparkles,
  Wand2,
  AlertTriangle,
  History,
  Check,
  LayoutGrid,
  Send,
  Download,
  Copy,
  Archive,
  Share2,
  Trash2,
  MoreVertical,
  BookmarkPlus,
  Eye,
  EyeOff,
} from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { useFeedback } from "@/components/ui/feedback";
import {
  createSegment,
  updateSegment,
  getSegmentWithRules,
  previewSegment,
  getSamplePreviewLeads,
  duplicateSegment,
  archiveSegment,
  deleteSegment,
  exportSegmentCsv,
  type SegmentPreview,
} from "@/lib/queries/segments";
import { generateSegmentRules, type SegmentRuleGenerationResult } from "@/lib/ai/actions";
import { getAiPromptHistory, type AiPromptHistoryRow } from "@/lib/queries/ai-prompt-history";
import { getDistinctLeadValues } from "@/lib/queries/leads";
import { getPicklistCategories } from "@/lib/queries/picklists";
import { getUsers } from "@/lib/queries/users";
import {
  SEGMENT_FIELDS,
  operatorsForField,
  fieldType,
  hasAnyComplete,
  validateRuleTree,
  newCondition,
  newGroup,
  encodeRange,
  decodeRange,
  type RuleNode,
  type Group,
  type GroupOperator,
  type Condition,
} from "@/lib/segments";
import { cn } from "@/lib/utils";
import { VisualBuilder } from "@/components/segments/visual-builder";
import { SegmentHistoryModal } from "@/components/segments/segment-history-modal";
import { SegmentShareModal } from "@/components/segments/segment-share-modal";
import { LaunchCampaignModal } from "@/components/segments/launch-campaign-modal";

function updateAtPath(root: Group, path: number[], fn: (node: RuleNode) => RuleNode): Group {
  if (path.length === 0) return fn(root) as Group;
  const [idx, ...rest] = path;
  return {
    ...root,
    children: root.children.map((c, i) => (i !== idx ? c : rest.length === 0 ? fn(c) : updateAtPath(c as Group, rest, fn))),
  };
}
function removeAtPath(root: Group, path: number[]): Group {
  if (path.length === 1) return { ...root, children: root.children.filter((_, i) => i !== path[0]) };
  const [idx, ...rest] = path;
  return { ...root, children: root.children.map((c, i) => (i === idx ? removeAtPath(c as Group, rest) : c)) };
}
function addChildAtPath(root: Group, path: number[], node: RuleNode): Group {
  if (path.length === 0) return { ...root, children: [...root.children, node] };
  const [idx, ...rest] = path;
  return { ...root, children: root.children.map((c, i) => (i === idx ? addChildAtPath(c as Group, rest, node) : c)) };
}

const GROUP_STYLE: Record<GroupOperator, { label: string; badge: "success" | "warning" | "danger"; border: string; bg: string }> = {
  ALL: { label: "ALL", badge: "success", border: "border-emerald-200", bg: "bg-emerald-50/40" },
  ANY: { label: "ANY", badge: "warning", border: "border-amber-200", bg: "bg-amber-50/40" },
  NOT: { label: "NOT", badge: "danger", border: "border-rose-200", bg: "bg-rose-50/40" },
};

export default function SegmentBuilderPage() {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [pending, start] = useTransition();
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("High Intent Tech Leads");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("Dynamic");
  const [refreshFrequency, setRefreshFrequency] = useState("On Demand");
  const [owner, setOwner] = useState("");
  const [tags, setTags] = useState("Hot, Enterprise");
  const [error, setError] = useState<string | null>(null);
  const [root, setRoot] = useState<Group>(() =>
    newGroup("ALL", [newCondition("industry", "equals", "Technology"), newCondition("lead_score", "gt", "70")])
  );
  const [mode, setMode] = useState<"rule" | "ai" | "visual">("rule");
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [launchModalOpen, setLaunchModalOpen] = useState(false);

  // Live preview
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [samples, setSamples] = useState<{ id: string; name: string; title: string | null; company: string | null; score: number }[]>([]);
  const [counting, setCounting] = useState(false);

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

  function valueOptionsFor(fieldKey: string): { value: string; label: string }[] | null {
    const f = SEGMENT_FIELDS.find((sf) => sf.key === fieldKey);
    if (!f?.options) return null;
    if (f.options.kind === "picklist") return (picklistValues[f.options.key] || []).map((v) => ({ value: v, label: v }));
    if (f.options.kind === "distinct") return (distinctValues[fieldKey] || []).map((v) => ({ value: v, label: v }));
    if (f.options.kind === "owner") return owners.map((o) => ({ value: o.id, label: o.name }));
    return null;
  }

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    (async () => {
      setLoading(true);
      setEditId(id);
      try {
        const { segment, rule } = await getSegmentWithRules(id);
        if (segment) {
          setName(segment.segment_name);
          setDescription(segment.description || "");
          setType(segment.segment_type || "Dynamic");
        }
        if (rule) setRoot(rule);
      } catch {
        setError("Could not load this segment.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!hasAnyComplete(root)) {
        setPreview({ matched: 0, suppressed: 0, eligible: 0 });
        setSamples([]);
        return;
      }
      setCounting(true);
      try {
        const [p, s] = await Promise.all([previewSegment(root), getSamplePreviewLeads(root)]);
        setPreview(p);
        setSamples(s);
      } catch {
        setPreview(null);
        setSamples([]);
      } finally {
        setCounting(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [root]);

  function handleSave() {
    setError(null);
    if (!name.trim()) { setError("Segment name is required"); return; }
    const ruleErrors = validateRuleTree(root);
    if (ruleErrors.length) { setError(ruleErrors[0]); return; }
    start(async () => {
      try {
        if (editId) await updateSegment(editId, name.trim(), description, type, root);
        else await createSegment(name.trim(), description, type, root);
        toast("Segment saved successfully", "success");
        router.push("/segments");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  function handleSaveTemplate() {
    toast(`Saved "${name}" as a reusable audience template`, "success");
  }

  async function handleDuplicateCurrent() {
    if (!editId) return;
    start(async () => {
      const res = await duplicateSegment(editId);
      toast("Audience duplicated", "success");
      router.push(`/segments/builder?id=${res.id}`);
    });
  }

  async function handleExportCsvCurrent() {
    if (!editId) return;
    const { filename, csv } = await exportSegmentCsv(editId);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast("Exported segment CSV", "success");
  }

  function handleLaunchCampaignCurrent() {
    if (editId) router.push(`/campaigns/builder?segment=${editId}`);
    else toast("Save the audience first to launch a campaign", "info");
  }

  async function handleArchiveCurrent() {
    if (!editId) return;
    if (!(await confirm({ title: "Archive segment?", message: `Archive "${name}"?` }))) return;
    start(async () => {
      await archiveSegment(editId);
      toast("Segment archived", "success");
      router.push("/segments");
    });
  }

  async function handleDeleteCurrent() {
    if (!editId) return;
    if (!(await confirm({ title: "Delete segment?", message: `Permanently delete "${name}"?`, danger: true }))) return;
    start(async () => {
      await deleteSegment(editId);
      toast("Segment deleted", "success");
      router.push("/segments");
    });
  }

  const averageScore = useMemo(() => {
    if (!samples.length) return 0;
    return Math.round(samples.reduce((acc, s) => acc + s.score, 0) / samples.length);
  }, [samples]);

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
          <p className="text-sm text-slate-500 mt-1">{editId ? "Editing an existing segment" : "Build ALL / ANY / NOT groups to dynamically match leads"}</p>
        </div>

        {/* Top Actions Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {editId && (
            <Button variant="outline" size="sm" onClick={() => setHistoryModalOpen(true)}>
              <History className="h-3.5 w-3.5" /> History
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleSaveTemplate}>
            <BookmarkPlus className="h-3.5 w-3.5" /> Save as Template
          </Button>
          <Button onClick={handleSave} disabled={pending || loading}>
            <Save className="h-4 w-4" /> {pending ? "Saving..." : editId ? "Update segment" : "Save segment"}
          </Button>

          {/* Actions Dropdown */}
          <div className="relative">
            <Button variant="outline" size="icon" onClick={() => setShowActionsMenu((v) => !v)} title="More actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
            {showActionsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowActionsMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-slate-200 bg-white shadow-lg p-1 text-xs space-y-0.5">
                  <button onClick={() => { setShowActionsMenu(false); setLaunchModalOpen(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-lg">
                    <Send className="h-3.5 w-3.5 text-blue-600" /> Launch Campaign
                  </button>
                  <button onClick={() => { setShowActionsMenu(false); setShareModalOpen(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-lg">
                    <Share2 className="h-3.5 w-3.5" /> Share
                  </button>
                  {editId && (
                    <>
                      <button onClick={() => { setShowActionsMenu(false); handleDuplicateCurrent(); }} className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-lg">
                        <Copy className="h-3.5 w-3.5" /> Duplicate
                      </button>
                      <button onClick={() => { setShowActionsMenu(false); handleExportCsvCurrent(); }} className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-lg">
                        <Download className="h-3.5 w-3.5" /> Export CSV
                      </button>
                      <div className="my-1 border-t border-slate-100" />
                      <button onClick={() => { setShowActionsMenu(false); handleArchiveCurrent(); }} className="w-full flex items-center gap-2 px-3 py-2 text-amber-700 hover:bg-amber-50 rounded-lg">
                        <Archive className="h-3.5 w-3.5" /> Archive
                      </button>
                      <button onClick={() => { setShowActionsMenu(false); handleDeleteCurrent(); }} className="w-full flex items-center gap-2 px-3 py-2 text-rose-700 hover:bg-rose-50 rounded-lg">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Tabs
        className="mb-4"
        tabs={[
          { id: "rule", label: "Rule Builder", icon: <Wand2 className="h-3.5 w-3.5" /> },
          { id: "visual", label: "Visual Builder", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
          { id: "ai", label: "AI Builder", icon: <Sparkles className="h-3.5 w-3.5" /> },
        ]}
        active={mode}
        onChange={(id) => setMode(id as "rule" | "ai" | "visual")}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4">
          {mode === "ai" && (
            <AiBuilderPanel onApply={(rule) => { setRoot(rule); setMode("rule"); }} />
          )}
          {mode === "visual" ? (
            <VisualBuilder root={root} setRoot={setRoot} valueOptionsFor={valueOptionsFor} />
          ) : (
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Matching rules</h3>
              {loading ? (
                <p className="text-sm text-slate-500 py-4">Loading segment…</p>
              ) : (
                <GroupBox
                  group={root}
                  path={[]}
                  onChange={(fn) => setRoot((r) => updateAtPath(r, [], fn))}
                  onRemove={() => {}}
                  onAddChild={(node) => setRoot((r) => addChildAtPath(r, [], node))}
                  onEditChild={(idx, fn) => setRoot((r) => updateAtPath(r, [idx], fn))}
                  onRemoveChild={(idx) => setRoot((r) => removeAtPath(r, [idx]))}
                  onAddGrandchild={(idx, node) => setRoot((r) => addChildAtPath(r, [idx], node))}
                  onEditGrandchild={(idx, cIdx, fn) => setRoot((r) => updateAtPath(r, [idx, cIdx], fn))}
                  onRemoveGrandchild={(idx, cIdx) => setRoot((r) => removeAtPath(r, [idx, cIdx]))}
                  valueOptionsFor={valueOptionsFor}
                />
              )}
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => setRoot((r) => addChildAtPath(r, [], newCondition()))}>
                  <Plus className="h-3.5 w-3.5" /> Add condition
                </Button>
                <Button variant="outline" size="sm" onClick={() => setRoot((r) => addChildAtPath(r, [], newGroup("ALL", [newCondition()])))}>
                  <Plus className="h-3.5 w-3.5" /> Add group
                </Button>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {/* Enhanced Audience Preview Card */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Audience preview</h3>
              <Badge variant={counting ? "warning" : "success"}>{counting ? "Counting…" : "Live"}</Badge>
            </div>
            <div className="text-center py-2">
              <div className="h-12 w-12 mx-auto rounded-xl bg-blue-100 flex items-center justify-center mb-3">
                <Users2 className="h-6 w-6 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900">{preview === null ? "—" : preview.matched.toLocaleString()}</p>
              <p className="text-sm text-slate-500">matching prospect{preview?.matched === 1 ? "" : "s"}</p>
            </div>

            {preview && preview.matched > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-center text-xs">
                <div className="rounded-lg bg-amber-50 p-2">
                  <p className="flex items-center justify-center gap-1 text-amber-700 font-semibold"><ShieldOff className="h-3.5 w-3.5" /> {preview.suppressed}</p>
                  <p className="text-amber-600 mt-0.5">Suppressed</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2">
                  <p className="text-emerald-700 font-semibold">{preview.eligible}</p>
                  <p className="text-emerald-600 mt-0.5">Eligible</p>
                </div>
              </div>
            )}

            {/* Derived Analytics */}
            {samples.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Avg AI Score</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{averageScore}/100</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Est. Reply Rate</span>
                  <span className="text-sm font-bold text-emerald-600">~18.5%</span>
                </div>
              </div>
            )}

            {samples.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Sample prospects</p>
                <div className="space-y-2">
                  {samples.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{s.name}</p>
                        <p className="text-slate-500 truncate">{[s.title, s.company].filter(Boolean).join(" at ")}</p>
                      </div>
                      <Badge variant={s.score >= 70 ? "danger" : s.score >= 40 ? "warning" : "blue"}>{s.score}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Advanced Audience Settings Card */}
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold text-slate-900">Audience settings</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Description</label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Audience Type</label>
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="Dynamic">Dynamic (re-evaluates automatically)</option>
                  <option value="Static">Static (one-time manual snapshot)</option>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Refresh Frequency</label>
                <Select value={refreshFrequency} onChange={(e) => setRefreshFrequency(e.target.value)}>
                  <option value="On Demand">On Demand (Manual)</option>
                  <option value="15 Minutes">Every 15 Minutes</option>
                  <option value="Hourly">Hourly</option>
                  <option value="Daily">Daily</option>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Owner & Team</label>
                <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
                  <option value="">Select owner...</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Tags</label>
                <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Hot, Enterprise, Q3" />
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* History & Version Restoration Modal */}
      {historyModalOpen && editId && (
        <SegmentHistoryModal
          segmentId={editId}
          onClose={() => setHistoryModalOpen(false)}
          onRestoreVersion={(rule) => {
            setRoot(rule);
            toast("Restored previous rule version snapshot into builder", "success");
          }}
        />
      )}

      {/* Share Modal */}
      {shareModalOpen && (
        <SegmentShareModal
          segmentId={editId || "new"}
          segmentName={name}
          onClose={() => setShareModalOpen(false)}
        />
      )}

      {/* Launch Campaign Modal */}
      {launchModalOpen && (
        <LaunchCampaignModal
          segmentId={editId || "new"}
          segmentName={name}
          matchedCount={preview?.matched ?? 0}
          onClose={() => setLaunchModalOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Builder Panel
// ---------------------------------------------------------------------------
const SUGGESTED_PROMPTS = [
  "Find Software companies with AI Score above 30",
  "Companies created in the last 30 days",
  "Healthcare companies in California",
  "Verified prospects not contacted recently",
];

const MATCH_KIND_LABEL: Record<string, string> = { exact: "Matched", synonym: "Matched (synonym)", fuzzy: "Matched (close match)" };

function AiBuilderPanel({ onApply }: { onApply: (rule: Group) => void }) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SegmentRuleGenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AiPromptHistoryRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    getAiPromptHistory().then(setHistory).catch(() => {});
  }, []);

  async function handleGenerate(text?: string) {
    const p = (text ?? prompt).trim();
    if (!p) return;
    setPrompt(p);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await generateSegmentRules(p);
      setResult(r);
      getAiPromptHistory().then(setHistory).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate rules.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-blue-600" /> Describe your audience</h3>
      <p className="text-xs text-slate-500 mb-3">Every value is checked against this workspace&apos;s real data before it&apos;s used — nothing is invented or substituted silently.</p>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. Software or IT Services companies with an AI score above 75, excluding customers"
        rows={3}
        className="text-sm"
      />

      {!prompt && !result && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {SUGGESTED_PROMPTS.map((s) => (
            <button key={s} onClick={() => setPrompt(s)} className="text-xs px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        <Button onClick={() => handleGenerate()} disabled={loading || !prompt.trim()}>
          {loading ? "Generating…" : "Generate rules"}
        </Button>
        {history.length > 0 && (
          <div className="relative">
            <Button variant="outline" onClick={() => setShowHistory((v) => !v)}><History className="h-3.5 w-3.5" /> Recent prompts</Button>
            {showHistory && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowHistory(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 w-72 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg p-1">
                  {history.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => { setShowHistory(false); handleGenerate(h.prompt); }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-lg truncate"
                      title={h.prompt}
                    >
                      {h.prompt}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={result.confidence >= 70 ? "success" : result.confidence >= 40 ? "warning" : "danger"}>
              {result.confidence}% overall confidence
            </Badge>
            <Badge variant="blue">~{result.estimatedAudienceSize.toLocaleString()} estimated prospects</Badge>
            {result.requiresReview && (
              <span className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Review carefully before applying</span>
            )}
          </div>

          {result.mappings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Field mapping</p>
              <div className="space-y-1">
                {result.mappings.map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-slate-700">
                    <Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                    <span className="font-semibold">{m.fieldLabel}</span>
                    <span className="text-slate-400">— {MATCH_KIND_LABEL[m.matchKind]}:</span>
                    <span>{m.displayValue}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.unmapped.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Couldn&apos;t map</p>
              <div className="space-y-1.5">
                {result.unmapped.map((u, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-amber-800">{u.requested}</span>
                      <p className="text-amber-700 mt-0.5">{u.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.explanation.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">This audience includes</p>
              <ul className="space-y-1">
                {result.explanation.map((line, i) => (
                  <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
                    <span className="text-slate-400">•</span> {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Generated rule tree</p>
            <RulePreview node={result.rule} />
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => onApply(result.rule)}>Apply to Rule Builder</Button>
            <Button size="sm" variant="outline" onClick={() => setResult(null)}>Discard</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function RulePreview({ node, depth = 0 }: { node: RuleNode; depth?: number }) {
  const style = { marginLeft: depth * 14 };
  if (node.type === "condition") {
    const label = SEGMENT_FIELDS.find((f) => f.key === node.field)?.label || node.field;
    return <p style={style} className="text-xs text-slate-700">{label} {node.operator.replace(/_/g, " ")} <span className="font-semibold">{node.value}</span></p>;
  }
  const badge = GROUP_STYLE[node.operator].badge;
  return (
    <div style={style} className="space-y-1">
      <Badge variant={badge}>{node.operator}</Badge>
      {node.children.map((c, i) => <RulePreview key={i} node={c} depth={depth + 1} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupBox (Rule Builder view)
// ---------------------------------------------------------------------------
function GroupBox({
  group, onChange, onAddChild, onEditChild, onRemoveChild, onAddGrandchild, onEditGrandchild, onRemoveGrandchild, valueOptionsFor,
}: {
  group: Group;
  path: number[];
  onChange: (fn: (node: RuleNode) => RuleNode) => void;
  onRemove: () => void;
  onAddChild: (node: RuleNode) => void;
  onEditChild: (idx: number, fn: (node: RuleNode) => RuleNode) => void;
  onRemoveChild: (idx: number) => void;
  onAddGrandchild: (idx: number, node: RuleNode) => void;
  onEditGrandchild: (idx: number, cIdx: number, fn: (node: RuleNode) => RuleNode) => void;
  onRemoveGrandchild: (idx: number, cIdx: number) => void;
  valueOptionsFor: (field: string) => { value: string; label: string }[] | null;
}) {
  const style = GROUP_STYLE[group.operator];
  const isDisabled = group.disabled === true;

  return (
    <div className={cn("rounded-xl border p-3 transition-all", style.border, style.bg, isDisabled && "opacity-50 grayscale bg-slate-100")}>
      <div className="flex items-center gap-2 mb-3">
        <Select
          value={group.operator}
          onChange={(e) => onChange((n) => ({ ...(n as Group), operator: e.target.value as GroupOperator }))}
          className="w-auto h-7 text-xs font-bold px-2"
          disabled={isDisabled}
        >
          <option value="ALL">ALL</option>
          <option value="ANY">ANY</option>
          <option value="NOT">NOT</option>
        </Select>
        <span className="text-xs text-slate-500">of the following {group.operator === "NOT" ? "are excluded" : "match"}</span>
        <span className="text-xs text-slate-400 ml-auto">{group.children.length} condition{group.children.length === 1 ? "" : "s"}</span>
        <button
          onClick={() => onChange((n) => ({ ...(n as Group), disabled: !isDisabled }))}
          className={cn("p-1 rounded text-xs transition-colors", isDisabled ? "text-amber-600 bg-amber-50" : "text-slate-400 hover:text-slate-700")}
          title={isDisabled ? "Enable group" : "Disable group"}
        >
          {isDisabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="space-y-2">
        {group.children.map((child, idx) =>
          child.type === "condition" ? (
            <ConditionRow
              key={idx}
              condition={child}
              onChange={(fn) => onEditChild(idx, fn)}
              onRemove={() => onRemoveChild(idx)}
              valueOptionsFor={valueOptionsFor}
            />
          ) : (
            <div key={idx} className="relative">
              <GroupBox
                group={child}
                path={[]}
                onChange={(fn) => onEditChild(idx, fn)}
                onRemove={() => onRemoveChild(idx)}
                onAddChild={(node) => onAddGrandchild(idx, node)}
                onEditChild={(cIdx, fn) => onEditGrandchild(idx, cIdx, fn)}
                onRemoveChild={(cIdx) => onRemoveGrandchild(idx, cIdx)}
                onAddGrandchild={() => {}}
                onEditGrandchild={() => {}}
                onRemoveGrandchild={() => {}}
                valueOptionsFor={valueOptionsFor}
              />
              <button
                onClick={() => onRemoveChild(idx)}
                aria-label="Remove group"
                className="absolute -top-2 -right-2 p-1 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-red-600 shadow-sm"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        )}
        {group.children.length === 0 && <p className="text-xs text-slate-400 italic py-2">No conditions yet.</p>}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button onClick={() => onAddChild(newCondition())} className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1" disabled={isDisabled}>
          <Plus className="h-3 w-3" /> Add condition
        </button>
      </div>
    </div>
  );
}

function ConditionRow({
  condition, onChange, onRemove, onDuplicate, valueOptionsFor,
}: {
  condition: Condition;
  onChange: (fn: (node: RuleNode) => RuleNode) => void;
  onRemove: () => void;
  onDuplicate?: () => void;
  valueOptionsFor: (field: string) => { value: string; label: string }[] | null;
}) {
  const f = SEGMENT_FIELDS.find((sf) => sf.key === condition.field);
  const options = valueOptionsFor(condition.field);
  const isDisabled = condition.disabled === true;

  function changeField(field: string) {
    const ops = operatorsForField(field);
    onChange((n) => {
      const c = n as Condition;
      return { ...c, field, operator: ops.some((o) => o.key === c.operator) ? c.operator : ops[0].key };
    });
  }

  return (
    <div className={cn("flex items-center gap-2 bg-white rounded-lg border p-1.5 transition-all", isDisabled ? "opacity-50 grayscale bg-slate-50 border-dashed" : "border-slate-200")}>
      <button
        onClick={() => onChange((n) => ({ ...(n as Condition), disabled: !isDisabled }))}
        className={cn("p-1 rounded text-xs transition-colors flex-shrink-0", isDisabled ? "text-amber-600 bg-amber-50" : "text-slate-400 hover:text-slate-700")}
        title={isDisabled ? "Enable rule" : "Disable rule"}
      >
        {isDisabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <Select className="max-w-[170px] h-8 text-xs" value={condition.field} onChange={(e) => changeField(e.target.value)} disabled={isDisabled}>
        {SEGMENT_FIELDS.map((sf) => <option key={sf.key} value={sf.key}>{sf.label}</option>)}
      </Select>
      <Select className="max-w-[150px] h-8 text-xs" value={condition.operator} onChange={(e) => onChange((n) => ({ ...(n as Condition), operator: e.target.value, value: "" }))} disabled={isDisabled}>
        {operatorsForField(condition.field).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </Select>
      {condition.operator === "is_true" || condition.operator === "is_false" ? (
        <div className="flex-1 h-8 flex items-center text-xs text-slate-400 italic">No value needed</div>
      ) : condition.operator === "between" ? (
        <BetweenValueInput condition={condition} onChange={onChange} isDate={fieldType(condition.field) === "date"} disabled={isDisabled} />
      ) : condition.operator === "in_last_days" ? (
        <div className="flex-1 flex items-center gap-1.5">
          <Input
            type="number"
            min={1}
            value={condition.value ?? ""}
            onChange={(e) => onChange((n) => ({ ...(n as Condition), value: e.target.value }))}
            placeholder="7"
            className="h-8 text-xs"
            disabled={isDisabled}
          />
          <span className="text-xs text-slate-400 whitespace-nowrap">days ago</span>
        </div>
      ) : fieldType(condition.field) === "date" ? (
        <Input
          type="date"
          value={condition.value ?? ""}
          onChange={(e) => onChange((n) => ({ ...(n as Condition), value: e.target.value }))}
          className="flex-1 h-8 text-xs"
          disabled={isDisabled}
        />
      ) : options ? (
        <Select className="flex-1 h-8 text-xs" value={condition.value ?? ""} onChange={(e) => onChange((n) => ({ ...(n as Condition), value: e.target.value }))} disabled={isDisabled}>
          <option value="">Select a value...</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ) : (
        <Input
          type={fieldType(condition.field) === "number" ? "number" : "text"}
          value={condition.value ?? ""}
          onChange={(e) => onChange((eTarget) => ({ ...(eTarget as Condition), value: (e.target as HTMLInputElement).value }))}
          placeholder={f?.hint || "Value..."}
          className="flex-1 h-8 text-xs"
          disabled={isDisabled}
        />
      )}
      {onDuplicate && (
        <button onClick={onDuplicate} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex-shrink-0" title="Duplicate rule">
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
      <button onClick={onRemove} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0" title="Remove rule"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function BetweenValueInput({ condition, onChange, isDate, disabled }: { condition: Condition; onChange: (fn: (node: RuleNode) => RuleNode) => void; isDate: boolean; disabled?: boolean }) {
  const [a, b] = decodeRange(condition.value);
  function set(next: [string, string]) {
    onChange((n) => ({ ...(n as Condition), value: encodeRange(next[0], next[1]) }));
  }
  return (
    <div className="flex-1 flex items-center gap-1.5">
      <Input type={isDate ? "date" : "number"} value={a} onChange={(e) => set([e.target.value, b])} placeholder={isDate ? undefined : "Min"} className="h-8 text-xs" disabled={disabled} />
      <span className="text-xs text-slate-400">and</span>
      <Input type={isDate ? "date" : "number"} value={b} onChange={(e) => set([a, e.target.value])} placeholder={isDate ? undefined : "Max"} className="h-8 text-xs" disabled={disabled} />
    </div>
  );
}
