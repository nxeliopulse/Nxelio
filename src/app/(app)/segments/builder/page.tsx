"use client";
import { useState, useTransition, useEffect, useMemo, useCallback } from "react";
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
  LayoutGrid,
  Send,
  Download,
  Copy,
  Archive,
  Share2,
  Trash2,
  MoreVertical,
  Eye,
  EyeOff,
  Building2,
  Target,
  Zap,
  Play,
  Pencil,
  Globe,
  HelpCircle,
  LayoutTemplate
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
  getSegmentBreakdown,
  getSegmentTrend,
  getSegmentFunnel,
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
import { SegmentHistoryModal } from "@/components/segments/segment-history-modal";

// Chart imports with SSR guards
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
} from "recharts";

// Tree mutation helpers
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
  ALL: { label: "ALL", badge: "success", border: "border-emerald-200 dark:border-emerald-800/50", bg: "bg-emerald-50/40 dark:bg-emerald-950/10" },
  ANY: { label: "ANY", badge: "warning", border: "border-amber-200 dark:border-amber-800/50", bg: "bg-amber-50/40 dark:bg-amber-950/10" },
  NOT: { label: "NOT", badge: "danger", border: "border-rose-200 dark:border-rose-800/50", bg: "bg-rose-50/40 dark:bg-rose-950/10" },
};

// Fixed palette for the Top Industries donut — colors are purely presentational
// (assigned by rank), the underlying names/percentages are real query results.
const PIE_COLORS = ["#18A7B8", "#3B82F6", "#10B981", "#F59E0B", "#64748B"];

// Attribute Categories for toolbar lists
const CATEGORY_MAP = {
  Company: ["company_name", "industry", "company_size", "country"],
  Persona: ["job_title", "seniority", "status", "verified"],
  Intent: ["interest_area", "lead_score"],
  Engagement: ["source", "owner_id"]
};

export default function SegmentBuilderPage() {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [pending, start] = useTransition();
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Basic Settings
  const [name, setName] = useState("Untitled Segment");
  const [isEditingName, setIsEditingName] = useState(false);
  const [description, setDescription] = useState("");
  const [type, setType] = useState("Dynamic");
  const [status, setStatus] = useState("Draft");
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [createdByName, setCreatedByName] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [root, setRoot] = useState<Group>(() => newGroup("ALL", []));

  const [mode, setMode] = useState<"visual" | "rule" | "ai">("visual");
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [activeCategoryDropdown, setActiveCategoryDropdown] = useState<string | null>(null);

  // Live preview & stats — all null/empty until the real query resolves, so
  // nothing fabricated ever briefly flashes on screen before real data loads.
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [samples, setSamples] = useState<{ id: string; name: string; title: string | null; company: string | null; score: number; country: string | null }[]>([]);
  const [breakdown, setBreakdown] = useState<{ industries: { name: string; value: number }[]; countries: { name: string; value: number }[] }>({ industries: [], countries: [] });
  const [trendData, setTrendData] = useState<{ date: string; count: number }[]>([]);
  const [trendDays, setTrendDays] = useState(30);
  const [funnelSteps, setFunnelSteps] = useState<{ label: string; value: number }[]>([]);
  const [stepCounts, setStepCounts] = useState<number[]>([]);
  const [counting, setCounting] = useState(false);

  const [picklistValues, setPicklistValues] = useState<Record<string, string[]>>({});
  const [distinctValues, setDistinctValues] = useState<Record<string, string[]>>({});
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    (async () => {
      try {
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
      } catch (err) {
        console.error("Failed to load metadata values:", err);
      }
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
          setStatus(segment.status || "Active");
          setCreatedAt(segment.created_at);
          setUpdatedAt(segment.updated_at);
          setCreatedByName(segment.created_by_name || null);
        }
        if (rule) setRoot(rule);
      } catch {
        setError("Could not load this segment.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fetches every real number the page shows for the current rule tree — the
  // debounced effect below calls this on every edit, and "Run Preview" calls
  // it directly for an immediate refresh instead of waiting out the debounce.
  const refreshPreview = useCallback(async (days: number = trendDays) => {
    if (!hasAnyComplete(root)) {
      setPreview({ matched: 0, suppressed: 0, eligible: 0, companies: 0, avgScore: 0 });
      setSamples([]);
      setBreakdown({ industries: [], countries: [] });
      setTrendData([]);
      setFunnelSteps([]);
      setStepCounts(root.children.map(() => 0));
      return;
    }
    setCounting(true);
    try {
      const [p, s, b, t, f, steps] = await Promise.all([
        previewSegment(root),
        getSamplePreviewLeads(root),
        getSegmentBreakdown(root),
        getSegmentTrend(root, days),
        getSegmentFunnel(root),
        Promise.all(
          root.children.map((_, idx) =>
            previewSegment({ type: "group", operator: root.operator, children: root.children.slice(0, idx + 1) }).then((r) => r.matched)
          )
        ),
      ]);
      setPreview(p);
      setSamples(s);
      setBreakdown(b);
      setTrendData(t);
      setFunnelSteps(f);
      setStepCounts(steps);
    } catch {
      setPreview(null);
      setSamples([]);
      setBreakdown({ industries: [], countries: [] });
      setTrendData([]);
      setFunnelSteps([]);
      setStepCounts([]);
    } finally {
      setCounting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  useEffect(() => {
    const t = setTimeout(() => refreshPreview(), 500);
    return () => clearTimeout(t);
  }, [refreshPreview]);

  function handleSave(targetStatus: "Draft" | "Active") {
    setError(null);
    if (!name.trim()) { setError("Segment name is required"); return; }
    const ruleErrors = validateRuleTree(root);
    if (ruleErrors.length) { setError(ruleErrors[0]); return; }
    start(async () => {
      try {
        if (editId) await updateSegment(editId, name.trim(), description, type, root, targetStatus);
        else await createSegment(name.trim(), description, type, root, targetStatus);
        setStatus(targetStatus);
        toast(targetStatus === "Draft" ? "Draft saved" : "Segment published", "success");
        router.push("/segments");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
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

  function handleShareCurrent() {
    if (typeof window === "undefined") return;
    navigator.clipboard?.writeText(window.location.href).then(
      () => toast("Link copied to clipboard", "success"),
      () => toast("Couldn't copy link", "error")
    );
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

  const totalProspects = preview?.matched ?? 0;
  const companiesCount = preview?.companies ?? 0;
  const averageScore = preview?.avgScore ?? 0;
  const eligibleCount = preview?.eligible ?? 0;

  // Add a new condition of a specific field
  const addFieldCondition = (fieldKey: string) => {
    setRoot((r) => addChildAtPath(r, [], newCondition(fieldKey)));
    setActiveCategoryDropdown(null);
  };

  // The funnel SVG below is a fixed 4-layer visual — map the real, variable-
  // length progressive step list onto exactly 4 display points (first/last are
  // always real Total/Final; the middle two collapse toward whichever real
  // step is closest when there are fewer than 4 steps, rather than fabricating).
  const displayFunnel = useMemo(() => {
    const steps = funnelSteps.length ? funnelSteps : [{ label: "Total Prospects", value: 0 }, { label: "Final Segment", value: 0 }];
    const first = steps[0];
    const last = steps[steps.length - 1];
    const mid1 = steps.length > 2 ? steps[1] : first;
    const mid2 = steps.length > 3 ? steps[steps.length - 2] : mid1;
    return [first, mid1, mid2, last];
  }, [funnelSteps]);

  function formatRelativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
    return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
      
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link href="/segments" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 font-semibold transition-colors">
            <ArrowLeft className="h-3 w-3" /> Back to Segments
          </Link>
          
          <div className="flex items-center gap-3">
            {isEditingName ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setIsEditingName(false)}
                onKeyDown={(e) => e.key === "Enter" && setIsEditingName(false)}
                className="text-2xl font-bold border-slate-200 h-9 bg-white text-slate-900 focus:border-[var(--primary)] w-[300px]"
                autoFocus
              />
            ) : (
              <h1 
                onClick={() => setIsEditingName(true)} 
                className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 px-2 py-0.5 rounded cursor-pointer select-none transition-all group"
              >
                {name} <Pencil className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h1>
            )}
            
            <Badge className={cn(
              "border-none font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1",
              status === "Active" ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-800"
                : status === "Archived" ? "bg-amber-100 text-amber-800"
                : "bg-slate-100 text-slate-600"
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", status === "Active" ? "bg-emerald-600 animate-pulse" : "bg-slate-400")} />
              {status === "Active" ? "Live Segment" : status === "Archived" ? "Archived" : "Draft"}
            </Badge>
            <span className="text-xs text-slate-400 flex items-center gap-1 font-medium">
              {updatedAt ? `Updated ${formatRelativeTime(updatedAt)}` : "Not saved yet"}
            </span>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            className="text-xs font-semibold h-9 border-slate-200 hover:bg-slate-50 text-slate-700 bg-white"
            onClick={() => refreshPreview()}
            disabled={counting}
          >
            <Play className="h-3.5 w-3.5 mr-1" /> {counting ? "Refreshing…" : "Run Preview"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs font-semibold h-9 border-slate-200 hover:bg-slate-50 text-slate-700 bg-white"
            onClick={() => handleSave("Draft")}
            disabled={pending || loading}
          >
            <Save className="h-3.5 w-3.5 mr-1" /> Save Draft
          </Button>
          <Button
            size="sm"
            className="text-xs font-semibold h-9 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-md border-none"
            onClick={() => handleSave("Active")}
            disabled={pending || loading}
          >
            <Play className="h-3.5 w-3.5 mr-1 fill-white" /> Publish Segment
          </Button>

          {/* More Actions dropdown */}
          <div className="relative">
            <Button variant="outline" size="icon" className="h-9 w-9 border-slate-200 bg-white" onClick={() => setShowActionsMenu((v) => !v)}>
              <MoreVertical className="h-4 w-4 text-slate-600" />
            </Button>
            {showActionsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowActionsMenu(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-50 w-48 rounded-xl border border-slate-200 bg-white shadow-lg p-1 text-xs space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                  <button onClick={() => { setShowActionsMenu(false); handleLaunchCampaignCurrent(); }} className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-lg">
                    <Send className="h-3.5 w-3.5 text-blue-600" /> Launch Campaign
                  </button>
                  {editId && (
                    <>
                      <button onClick={() => { setShowActionsMenu(false); handleDuplicateCurrent(); }} className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-lg">
                        <Copy className="h-3.5 w-3.5" /> Duplicate
                      </button>
                      <button onClick={() => { setShowActionsMenu(false); handleExportCsvCurrent(); }} className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-lg">
                        <Download className="h-3.5 w-3.5" /> Export CSV
                      </button>
                      <button onClick={() => { setShowActionsMenu(false); handleShareCurrent(); }} className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-lg">
                        <Share2 className="h-3.5 w-3.5" /> Share
                      </button>
                      <button onClick={() => { setShowActionsMenu(false); setHistoryModalOpen(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-lg">
                        <History className="h-3.5 w-3.5" /> View History
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
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Top Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat 1: Total Prospects */}
        <Card className="p-4 flex items-center justify-between border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="space-y-1.5">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Prospects</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{totalProspects.toLocaleString()}</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Matching the current rule</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center">
            <Users2 className="h-5 w-5 text-purple-600" />
          </div>
        </Card>

        {/* Stat 2: Companies */}
        <Card className="p-4 flex items-center justify-between border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="space-y-1.5">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Companies</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{companiesCount.toLocaleString()}</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Distinct companies matched</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
        </Card>

        {/* Stat 3: Avg Score */}
        <Card className="p-4 flex items-center justify-between border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="space-y-1.5">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Avg. Score</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{averageScore}</span>
              <span className="text-xs text-slate-400 font-medium">/100</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Across matched prospects</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Target className="h-5 w-5 text-emerald-600" />
          </div>
        </Card>

        {/* Stat 4: Eligible */}
        <Card className="p-4 flex items-center justify-between border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="space-y-1.5">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1">
              Eligible <span title="Matched minus unsubscribed / do-not-contact / bounced"><HelpCircle className="h-3 w-3 text-slate-300 cursor-pointer" /></span>
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{eligibleCount.toLocaleString()}</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              {preview ? `${preview.suppressed.toLocaleString()} suppressed` : "Can actually be contacted"}
            </span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <ShieldOff className="h-5 w-5 text-amber-600" />
          </div>
        </Card>
      </div>

      {/* 3. Main Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        
        {/* Left Workspace Area */}
        <div className="space-y-6">
          
          {/* Builder Tabs */}
          <div className="flex items-center justify-between border-b border-slate-200">
            <Tabs
              className="mb-[-1px] text-sm"
              tabs={[
                { id: "visual", label: "Visual Builder", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
                { id: "rule", label: "Rule Builder", icon: <Wand2 className="h-3.5 w-3.5" /> },
                { id: "ai", label: "AI Builder", icon: <Sparkles className="h-3.5 w-3.5" /> },
              ]}
              active={mode}
              onChange={(id) => setMode(id as "visual" | "rule" | "ai")}
            />
            {mode === "ai" && <Badge className="bg-purple-100 text-purple-800 font-bold border-none text-[10px]">NEW</Badge>}
          </div>

          {/* Builder Workspace panels */}
          <div className="min-h-[400px]">
            {mode === "ai" && (
              <AiBuilderPanel onApply={(rule) => { setRoot(rule); setMode("visual"); }} />
            )}

            {mode === "visual" && (
              <div className="flex gap-4">
                {/* Flowchart canvas */}
                <div className="flex-1 rounded-2xl border border-slate-100 bg-slate-50/50 p-6 flex flex-col items-center relative overflow-hidden">
                  
                  {/* Start Node */}
                  <div className="z-10 rounded-full bg-emerald-100 text-emerald-800 border-none font-bold text-xs px-5 py-2 flex items-center gap-1.5 shadow-sm hover:scale-105 transition-transform">
                    <Play className="h-3.5 w-3.5 fill-emerald-800" /> Start
                  </div>
                  
                  {/* Vertical Flow Line */}
                  <div className="w-[2px] bg-slate-200 flex-1 min-h-[30px]" />

                  {/* Flow conditions nodes */}
                  {root.children.map((child, idx) => {
                    const isLast = idx === root.children.length - 1;
                    if (child.type === "condition") {
                      const label = SEGMENT_FIELDS.find((f) => f.key === child.field)?.label || child.field;
                      const isComplete = child.value && child.value !== "";
                      
                      // Node style details
                      let icon = <Users2 className="h-4 w-4 text-slate-500" />;
                      let iconBg = "bg-slate-100";
                      if (child.field === "industry" || child.field === "company_name") {
                        icon = <Building2 className="h-4 w-4 text-cyan-600" />;
                        iconBg = "bg-cyan-50";
                      } else if (child.field === "company_size" || child.field === "seniority") {
                        icon = <LayoutTemplate className="h-4 w-4 text-emerald-600" />;
                        iconBg = "bg-emerald-50";
                      } else if (child.field === "country" || child.field === "source") {
                        icon = <Globe className="h-4 w-4 text-purple-600" />;
                        iconBg = "bg-purple-50";
                      } else if (child.field === "lead_score") {
                        icon = <Target className="h-4 w-4 text-orange-600" />;
                        iconBg = "bg-orange-50";
                      } else if (child.field === "owner_id") {
                        icon = <Zap className="h-4 w-4 text-amber-600" />;
                        iconBg = "bg-amber-50";
                      }

                      // Real progressive count — how many leads still match once
                      // this condition and every one before it (by position) are applied.
                      const stepMatchCount = counting || stepCounts[idx] === undefined ? "—" : stepCounts[idx].toLocaleString();

                      return (
                        <div key={idx} className="w-full flex flex-col items-center z-10">
                          {/* Condition Block */}
                          <Card className="w-full max-w-[500px] p-4 bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative group/card rounded-xl">
                            <div className="flex items-center gap-3">
                              {/* Left Icon container */}
                              <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0", iconBg)}>
                                {icon}
                              </div>

                              {/* Rule Content */}
                              <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap text-sm">
                                <span className="font-semibold text-slate-700">{label}</span>
                                <span className="text-slate-400">is</span>
                                
                                <Select 
                                  className="h-7 text-xs border-transparent hover:border-slate-200 bg-transparent px-1 hover:bg-slate-50 rounded min-w-[80px]"
                                  value={child.operator}
                                  onChange={(e) => setRoot(r => updateAtPath(r, [idx], (n) => ({ ...(n as Condition), operator: e.target.value, value: "" })))}
                                >
                                  {operatorsForField(child.field).map(op => (
                                    <option key={op.key} value={op.key}>{op.label}</option>
                                  ))}
                                </Select>

                                {child.operator === "between" ? (
                                  <BetweenInput condition={child} onChange={(fn) => setRoot(r => updateAtPath(r, [idx], fn))} />
                                ) : valueOptionsFor(child.field) ? (
                                  <Select
                                    className="h-7 text-xs border-transparent hover:border-slate-200 bg-transparent px-2 font-semibold text-indigo-600 bg-indigo-50/50 rounded"
                                    value={child.value ?? ""}
                                    onChange={(e) => setRoot(r => updateAtPath(r, [idx], (n) => ({ ...(n as Condition), value: e.target.value })))}
                                  >
                                    <option value="">Select...</option>
                                    {valueOptionsFor(child.field)?.map(opt => (
                                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                  </Select>
                                ) : (
                                  <Input
                                    value={child.value ?? ""}
                                    onChange={(e) => setRoot(r => updateAtPath(r, [idx], (n) => ({ ...(n as Condition), value: e.target.value })))}
                                    placeholder="value..."
                                    className="h-7 text-xs border-transparent hover:border-slate-200 bg-transparent font-semibold text-indigo-600 px-2 py-0.5 rounded w-28 text-center"
                                  />
                                )}
                              </div>

                              {/* Right Match Count */}
                              <div className="flex items-center gap-3">
                                <div className="text-right flex-shrink-0">
                                  <span className="text-sm font-bold text-slate-800">{stepMatchCount}</span>
                                  <span className="block text-[10px] text-slate-400">matching</span>
                                </div>

                                {/* Menu / Action Trigger */}
                                <div className="relative opacity-0 group-hover/card:opacity-100 transition-opacity">
                                  <button 
                                    onClick={() => setRoot(r => removeAtPath(r, [idx]))}
                                    className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                                    title="Delete rule"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </Card>

                          {/* Connector Line and Badge */}
                          <div className="w-[2px] bg-slate-200 flex-1 min-h-[30px]" />
                          {!isLast && (
                            <div className="my-[-12px] z-10 rounded-full border border-slate-200 bg-white font-bold text-[10px] text-slate-500 px-2.5 py-0.5 cursor-pointer shadow-sm hover:bg-slate-50" onClick={() => {
                              setRoot(r => ({ ...r, operator: r.operator === "ALL" ? "ANY" : "ALL" }));
                            }}>
                              {root.operator === "ALL" ? "AND" : "OR"}
                            </div>
                          )}
                          {!isLast && <div className="w-[2px] bg-slate-200 flex-1 min-h-[30px]" />}
                        </div>
                      );
                    }
                    return null;
                  })}

                  {/* Segment Result Node */}
                  <Card className="w-full max-w-[500px] p-5 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 border border-indigo-100 shadow-sm z-10 rounded-xl">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <span className="text-xs text-indigo-500 font-bold uppercase tracking-wider">Segment Result</span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-extrabold text-indigo-900">
                            {preview === null ? "—" : preview.matched.toLocaleString()}
                          </span>
                          <span className="text-xs text-indigo-600 font-semibold">Prospects</span>
                        </div>
                        <p className="text-xs text-slate-400 font-medium">This audience will update automatically</p>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-800 border-none font-semibold text-[10px] py-0.5 rounded-full px-2.5">
                        Live Estimate
                      </Badge>
                    </div>
                  </Card>

                </div>

                {/* Floating sidebar menu for "Add Rule" */}
                <div className="w-16 flex flex-col items-center border border-slate-200 bg-white rounded-2xl p-2.5 space-y-4 self-start sticky top-6 shadow-sm">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center border-b border-slate-100 pb-1.5 w-full">Rule</div>
                  
                  {/* Category Options */}
                  {(["Company", "Persona", "Intent", "Engagement"] as const).map(cat => {
                    let icon = <Building2 className="h-5 w-5" />;
                    let color = "text-cyan-600 hover:bg-cyan-50";
                    if (cat === "Persona") {
                      icon = <Users2 className="h-5 w-5" />;
                      color = "text-emerald-600 hover:bg-emerald-50";
                    } else if (cat === "Intent") {
                      icon = <Target className="h-5 w-5" />;
                      color = "text-orange-600 hover:bg-orange-50";
                    } else if (cat === "Engagement") {
                      icon = <Zap className="h-5 w-5" />;
                      color = "text-purple-600 hover:bg-purple-50";
                    }

                    const isOpen = activeCategoryDropdown === cat;

                    return (
                      <div key={cat} className="relative">
                        <button
                          onClick={() => setActiveCategoryDropdown(isOpen ? null : cat)}
                          className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer", color, isOpen && "bg-slate-100")}
                          title={cat}
                        >
                          {icon}
                        </button>
                        <span className="text-[9px] text-slate-400 font-semibold mt-1 block text-center leading-none">{cat}</span>

                        {/* Floating mini list for selection */}
                        {isOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setActiveCategoryDropdown(null)} />
                            <div className="absolute left-full top-0 ml-2.5 z-50 w-44 rounded-xl border border-slate-200 bg-white shadow-lg p-1.5 space-y-1 animate-in fade-in slide-in-from-left-2 duration-150">
                              <p className="text-[10px] font-bold text-slate-400 uppercase px-2 py-0.5 tracking-wider border-b border-slate-50 mb-1">{cat} Attributes</p>
                              {CATEGORY_MAP[cat].map(field => {
                                const f = SEGMENT_FIELDS.find(sf => sf.key === field);
                                return (
                                  <button
                                    key={field}
                                    onClick={() => addFieldCondition(field)}
                                    className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
                                  >
                                    {f?.label ?? field}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div className="border-t border-slate-100 pt-2 w-full flex flex-col items-center">
                    <button onClick={() => addFieldCondition("industry")} className="h-9 w-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 cursor-pointer">
                      <Plus className="h-5 w-5" />
                    </button>
                    <span className="text-[9px] text-slate-400 font-semibold mt-0.5 block text-center leading-none">More</span>
                  </div>
                </div>
              </div>
            )}

            {mode === "rule" && (
              <Card className="p-6 bg-white border-slate-200/60 rounded-2xl shadow-sm">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><LayoutGrid className="h-5 w-5 text-indigo-500" /> Filter Criteria</h3>
                {loading ? (
                  <p className="text-sm text-slate-400 py-4">Loading conditions...</p>
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
                <div className="flex items-center gap-2.5 mt-5 pt-4 border-t border-slate-100">
                  <Button variant="outline" size="sm" className="text-xs h-8 text-slate-700 hover:bg-slate-50 bg-white" onClick={() => setRoot((r) => addChildAtPath(r, [], newCondition()))}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Condition
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs h-8 text-slate-700 hover:bg-slate-50 bg-white" onClick={() => setRoot((r) => addChildAtPath(r, [], newGroup("ALL", [newCondition()])))}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Group
                  </Button>
                </div>
              </Card>
            )}
          </div>

          {/* Bottom section: Funnel and Trend charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Audience Funnel Card */}
            <Card className="p-5 bg-white border border-slate-100 shadow-sm rounded-2xl">
              <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider">Audience Funnel</h3>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
                {/* SVG Funnel representation */}
                <div className="w-full max-w-[160px] flex-shrink-0">
                  <svg viewBox="0 0 200 160" className="w-full overflow-visible">
                    <defs>
                      <linearGradient id="funnelGrad1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#818CF8" />
                        <stop offset="100%" stopColor="#4F46E5" />
                      </linearGradient>
                      <linearGradient id="funnelGrad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38BDF8" />
                        <stop offset="100%" stopColor="#0284C7" />
                      </linearGradient>
                      <linearGradient id="funnelGrad3" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34D399" />
                        <stop offset="100%" stopColor="#059669" />
                      </linearGradient>
                      <linearGradient id="funnelGrad4" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#A78BFA" />
                        <stop offset="100%" stopColor="#7C3AED" />
                      </linearGradient>
                    </defs>
                    
                    {/* Layer 1: Total Prospects */}
                    <path d="M10,5 L190,5 L170,35 L30,35 Z" fill="url(#funnelGrad1)" opacity="0.9" />
                    <text x="100" y="24" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">
                      {displayFunnel[0].value.toLocaleString()}
                    </text>

                    {/* Layer 2 */}
                    <path d="M32,38 L168,38 L150,68 L50,68 Z" fill="url(#funnelGrad2)" opacity="0.9" />
                    <text x="100" y="57" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">
                      {displayFunnel[1].value.toLocaleString()}
                    </text>

                    {/* Layer 3 */}
                    <path d="M52,71 L148,71 L132,101 L68,101 Z" fill="url(#funnelGrad3)" opacity="0.9" />
                    <text x="100" y="90" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">
                      {displayFunnel[2].value.toLocaleString()}
                    </text>

                    {/* Layer 4: Final Segment */}
                    <path d="M70,104 L130,104 L115,134 L85,134 Z" fill="url(#funnelGrad4)" opacity="0.9" />
                    <text x="100" y="123" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">
                      {displayFunnel[3].value.toLocaleString()}
                    </text>
                  </svg>
                </div>

                {/* Detailed Steps List */}
                <div className="flex-1 w-full flex flex-col justify-between self-stretch">
                  <div className="space-y-2.5">
                    {displayFunnel.map((step, idx) => {
                      const colors = [
                        "bg-indigo-500",
                        "bg-sky-500",
                        "bg-emerald-500",
                        "bg-violet-500"
                      ];
                      const pct = displayFunnel[0].value > 0 ? ((step.value / displayFunnel[0].value) * 100).toFixed(1) : "0.0";
                      
                      return (
                        <div key={idx} className="flex items-center justify-between text-xs border-b border-slate-50 pb-2 last:border-b-0 last:pb-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0", colors[idx])} />
                            <span className="font-semibold text-slate-600 truncate max-w-[130px] sm:max-w-none" title={step.label}>
                              {step.label}
                            </span>
                          </div>
                          <div className="text-right flex items-center gap-1.5">
                            <span className="font-bold text-slate-800">{step.value.toLocaleString()}</span>
                            <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-100/80 px-1.5 py-0.5 rounded-md">
                              {pct}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-500">Funnel Efficiency:</span>
                    <span className="font-bold text-indigo-600 bg-indigo-50/70 border border-indigo-100/50 px-2 py-0.5 rounded-md">
                      {displayFunnel[0].value > 0 ? ((displayFunnel[3].value / displayFunnel[0].value) * 100).toFixed(1) : "0.0"}%
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Audience Trend Card */}
            <Card className="p-5 bg-white border border-slate-100 shadow-sm rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Audience Trend</h3>
                <Select
                  className="h-6 text-[10px] w-28 bg-slate-50 border-slate-100 font-semibold"
                  value={String(trendDays)}
                  onChange={(e) => {
                    const days = Number(e.target.value);
                    setTrendDays(days);
                    refreshPreview(days);
                  }}
                >
                  <option value="30">Last 30 Days</option>
                  <option value="90">Last 90 Days</option>
                </Select>
              </div>

              <div className="h-44 w-full">
                {!mounted ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-300">Loading chart...</div>
                ) : trendData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">No matching prospects yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#818CF8" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#818CF8" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tickLine={false} axisLine={false} style={{ fontSize: 9, fill: "#94A3B8", fontWeight: 600 }} />
                      <YAxis tickLine={false} axisLine={false} style={{ fontSize: 9, fill: "#94A3B8", fontWeight: 600 }} />
                      <ChartTooltip
                        contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 11, fontWeight: 600 }}
                      />
                      <Area type="monotone" dataKey="count" stroke="#6366F1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCount)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

        </div>

        {/* Right Sidebar Panel */}
        <div className="space-y-6">
          
          {/* Section 1: Audience Insights */}
          <Card className="p-5 bg-white border border-slate-100 shadow-sm rounded-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Audience Insights</h3>
              <Badge className="bg-emerald-100 text-emerald-800 border-none font-semibold text-[10px] py-0.5 rounded-full px-2">
                <span className="h-1 w-1 rounded-full bg-emerald-600 mr-1 inline-block" /> Live
              </Badge>
            </div>
            
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{totalProspects.toLocaleString()} Prospects</div>

            {/* Donut Chart: Top Industries */}
            <div className="space-y-3.5">
              <span className="text-xs font-bold text-slate-700 block">Top Industries</span>
              {breakdown.industries.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-1">No matching prospects yet</p>
              ) : (
                <div className="flex items-center gap-4">
                  {/* Donut Pie chart */}
                  <div className="h-28 w-28 flex-shrink-0">
                    {mounted ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={breakdown.industries}
                            innerRadius={28}
                            outerRadius={44}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {breakdown.industries.map((_, idx) => (
                              <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full w-full rounded-full border-4 border-slate-100" />
                    )}
                  </div>

                  {/* Legends */}
                  <div className="flex-1 space-y-1">
                    {breakdown.industries.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                          <span className="font-semibold text-slate-600 truncate">{item.name}</span>
                        </div>
                        <span className="font-bold text-slate-800">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Progress Bars: Countries */}
            <div className="space-y-3 pt-3 border-t border-slate-50">
              <span className="text-xs font-bold text-slate-700 block">Top Countries</span>
              {breakdown.countries.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-1">No matching prospects yet</p>
              ) : (
                <div className="space-y-2.5">
                  {breakdown.countries.map((bar, idx) => (
                    <div key={idx} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between font-semibold text-slate-600">
                        <span>{bar.name}</span>
                        <span className="font-bold text-slate-800">{bar.value}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                          style={{ width: `${bar.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Section 2: Prospect Sample */}
          <Card className="p-5 bg-white border border-slate-100 shadow-sm rounded-2xl space-y-4">
            <h3 className="font-bold text-slate-800">Prospect Sample</h3>

            <div className="space-y-3.5">
              {samples.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2 text-center">No samples match current criteria</p>
              ) : (
                samples.map((lead) => {
                  const nameInitials = lead.name.split(" ").map(n => n[0]).join("").substring(0, 2);
                  return (
                    <div key={lead.id} className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Avatar */}
                        <div className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center flex-shrink-0 border border-indigo-100">
                          {nameInitials}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate">{lead.name}</p>
                          <p className="text-slate-400 text-[10px] font-medium truncate">
                            {[lead.title, lead.company].filter(Boolean).join(" at ")}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge className="bg-emerald-50 text-emerald-700 border-none font-bold text-[10px] px-1.5 py-0.5 rounded">
                          {lead.score}
                        </Badge>
                        {lead.country && <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{lead.country}</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Section 3: Segment Settings */}
          <Card className="p-5 bg-white border border-slate-100 shadow-sm rounded-2xl space-y-4">
            <h3 className="font-bold text-slate-800">Segment Settings</h3>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-xs">
              <div>
                <span className="block text-slate-400 font-semibold text-[10px] uppercase tracking-wider mb-0.5">Segment Type</span>
                <span className="font-bold text-slate-700">{type}</span>
              </div>

              <div>
                <span className="block text-slate-400 font-semibold text-[10px] uppercase tracking-wider mb-0.5">Status</span>
                <span className="font-bold text-slate-700">{status}</span>
              </div>

              <div>
                <span className="block text-slate-400 font-semibold text-[10px] uppercase tracking-wider mb-0.5">Created By</span>
                <span className="font-bold text-slate-700">{createdByName || "—"}</span>
              </div>

              <div>
                <span className="block text-slate-400 font-semibold text-[10px] uppercase tracking-wider mb-0.5">Created On</span>
                <span className="font-bold text-slate-700">
                  {createdAt ? new Date(createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "Not saved yet"}
                </span>
              </div>
            </div>
          </Card>

        </div>
      </div>

      {/* History Modal */}
      {historyModalOpen && editId && (
        <SegmentHistoryModal segmentId={editId} onClose={() => setHistoryModalOpen(false)} />
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Between condition Value Input Helper
// ---------------------------------------------------------------------------
function BetweenInput({ condition, onChange }: { condition: Condition; onChange: (fn: (node: RuleNode) => RuleNode) => void }) {
  const [a, b] = decodeRange(condition.value);
  const isDate = fieldType(condition.field) === "date";
  
  function update(next: [string, string]) {
    onChange((n) => ({ ...(n as Condition), value: encodeRange(next[0], next[1]) }));
  }

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <Input
        type={isDate ? "date" : "number"}
        value={a}
        onChange={(e) => update([e.target.value, b])}
        placeholder="Min"
        className="h-7 text-xs border-transparent hover:border-slate-200 bg-slate-50/50 hover:bg-slate-50 rounded px-1.5 w-14 font-semibold text-indigo-600 text-center"
      />
      <span className="text-[11px] text-slate-400 font-medium">and</span>
      <Input
        type={isDate ? "date" : "number"}
        value={b}
        onChange={(e) => update([a, e.target.value])}
        placeholder="Max"
        className="h-7 text-xs border-transparent hover:border-slate-200 bg-slate-50/50 hover:bg-slate-50 rounded px-1.5 w-14 font-semibold text-indigo-600 text-center"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Builder Panel Component (Classic Tab panel)
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
    <Card className="p-6 bg-white border-slate-200/60 rounded-2xl shadow-sm space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold text-slate-800 flex items-center gap-1.5"><Sparkles className="h-5 w-5 text-indigo-500 fill-indigo-100" /> AI Segment Builder</h3>
        <p className="text-xs text-slate-400 font-medium">Describe your ideal audience. Every attribute is verified against your database structure.</p>
      </div>

      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. Software or IT Services companies with an AI score above 75, excluding customers"
        rows={3}
        className="text-xs border-slate-200 focus:border-indigo-500 rounded-xl"
      />

      {!prompt && !result && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_PROMPTS.map((s) => (
            <button key={s} onClick={() => setPrompt(s)} className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors cursor-pointer">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        <Button onClick={() => handleGenerate()} disabled={loading || !prompt.trim()} className="text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
          {loading ? "Generating..." : "Generate Rules"}
        </Button>
        {history.length > 0 && (
          <div className="relative">
            <Button variant="outline" size="sm" className="text-xs h-8 border-slate-200 bg-white" onClick={() => setShowHistory((v) => !v)}><History className="h-3.5 w-3.5 mr-1" /> Recent prompts</Button>
            {showHistory && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowHistory(false)} />
                <div className="absolute left-0 top-full mt-1.5 z-50 w-72 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg p-1">
                  {history.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => { setShowHistory(false); handleGenerate(h.prompt); }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-lg truncate font-semibold"
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
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
          <div className="flex items-center gap-2 flex-wrap text-xs font-semibold">
            <Badge className={result.confidence >= 70 ? "bg-emerald-100 text-emerald-800" : result.confidence >= 40 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"}>
              {result.confidence}% confidence
            </Badge>
            <Badge className="bg-indigo-100 text-indigo-800">~{result.estimatedAudienceSize.toLocaleString()} matches</Badge>
            {result.requiresReview && (
              <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Requires review</span>
            )}
          </div>

          {result.explanation.length > 0 && (
            <div className="space-y-1 text-xs">
              <span className="font-bold text-slate-400 uppercase tracking-wider block">Description Details</span>
              <ul className="space-y-1 list-disc list-inside text-slate-600 font-semibold">
                {result.explanation.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
            <Button size="sm" className="text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => onApply(result.rule)}>Apply to Visual Canvas</Button>
            <Button size="sm" variant="outline" className="text-xs h-8 border-slate-200 text-slate-700 bg-white" onClick={() => setResult(null)}>Discard</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// GroupBox Component (Classic Rule Builder view)
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
    <div className={cn("rounded-xl border p-4 transition-all space-y-3", style.border, style.bg, isDisabled && "opacity-50 grayscale bg-slate-100")}>
      <div className="flex items-center gap-2 mb-1">
        <Select
          value={group.operator}
          onChange={(e) => onChange((n) => ({ ...(n as Group), operator: e.target.value as GroupOperator }))}
          className="w-auto h-8 text-xs font-bold px-2"
          disabled={isDisabled}
        >
          <option value="ALL">ALL</option>
          <option value="ANY">ANY</option>
          <option value="NOT">NOT</option>
        </Select>
        <span className="text-xs text-slate-400 font-semibold">of the following conditions must match</span>
        <span className="text-xs text-slate-400 ml-auto font-medium">{group.children.length} items</span>
        
        <button
          onClick={() => onChange((n) => ({ ...(n as Group), disabled: !isDisabled }))}
          className={cn("p-1 rounded transition-colors text-slate-400 hover:text-slate-700")}
          title={isDisabled ? "Enable group" : "Disable group"}
        >
          {isDisabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-red-600 shadow-sm"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        )}
        {group.children.length === 0 && <p className="text-xs text-slate-400 italic py-2">No conditions yet.</p>}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button onClick={() => onAddChild(newCondition())} className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1" disabled={isDisabled}>
          <Plus className="h-3.5 w-3.5" /> Add Condition
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConditionRow Helper (Classic view condition editor)
// ---------------------------------------------------------------------------
function ConditionRow({
  condition, onChange, onRemove, valueOptionsFor,
}: {
  condition: Condition;
  onChange: (fn: (node: RuleNode) => RuleNode) => void;
  onRemove: () => void;
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
    <div className={cn("flex items-center gap-2 bg-white rounded-xl border p-2 transition-all border-slate-200")}>
      <button
        onClick={() => onChange((n) => ({ ...(n as Condition), disabled: !isDisabled }))}
        className={cn("p-1 rounded transition-colors text-slate-400 hover:text-slate-700")}
        title={isDisabled ? "Enable rule" : "Disable rule"}
      >
        {isDisabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      
      <Select className="max-w-[170px] h-8 text-xs border-slate-100 focus:border-indigo-500" value={condition.field} onChange={(e) => changeField(e.target.value)} disabled={isDisabled}>
        {SEGMENT_FIELDS.map((sf) => <option key={sf.key} value={sf.key}>{sf.label}</option>)}
      </Select>
      
      <Select className="max-w-[150px] h-8 text-xs border-slate-100 focus:border-indigo-500" value={condition.operator} onChange={(e) => onChange((n) => ({ ...(n as Condition), operator: e.target.value, value: "" }))} disabled={isDisabled}>
        {operatorsForField(condition.field).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </Select>

      {condition.operator === "is_true" || condition.operator === "is_false" ? (
        <div className="flex-1 h-8 flex items-center text-xs text-slate-400 italic font-medium">No value needed</div>
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
            className="h-8 text-xs border-slate-100"
            disabled={isDisabled}
          />
          <span className="text-xs text-slate-400 font-medium">days ago</span>
        </div>
      ) : fieldType(condition.field) === "date" ? (
        <Input
          type="date"
          value={condition.value ?? ""}
          onChange={(e) => onChange((n) => ({ ...(n as Condition), value: e.target.value }))}
          className="flex-1 h-8 text-xs border-slate-100"
          disabled={isDisabled}
        />
      ) : options ? (
        <Select className="flex-1 h-8 text-xs border-slate-100 focus:border-indigo-500" value={condition.value ?? ""} onChange={(e) => onChange((n) => ({ ...(n as Condition), value: e.target.value }))} disabled={isDisabled}>
          <option value="">Select a value...</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ) : (
        <Input
          type={fieldType(condition.field) === "number" ? "number" : "text"}
          value={condition.value ?? ""}
          onChange={(e) => onChange((eTarget) => ({ ...(eTarget as Condition), value: (e.target as HTMLInputElement).value }))}
          placeholder={f?.hint || "Value..."}
          className="flex-1 h-8 text-xs border-slate-100"
          disabled={isDisabled}
        />
      )}
      
      <button onClick={onRemove} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BetweenValueInput Helper for Classic View
// ---------------------------------------------------------------------------
function BetweenValueInput({ condition, onChange, isDate, disabled }: { condition: Condition; onChange: (fn: (node: RuleNode) => RuleNode) => void; isDate: boolean; disabled?: boolean }) {
  const [a, b] = decodeRange(condition.value);
  function set(next: [string, string]) {
    onChange((n) => ({ ...(n as Condition), value: encodeRange(next[0], next[1]) }));
  }
  return (
    <div className="flex-1 flex items-center gap-1.5">
      <Input type={isDate ? "date" : "number"} value={a} onChange={(e) => set([e.target.value, b])} placeholder={isDate ? undefined : "Min"} className="h-8 text-xs border-slate-100" disabled={disabled} />
      <span className="text-xs text-slate-400 font-medium">and</span>
      <Input type={isDate ? "date" : "number"} value={b} onChange={(e) => set([a, e.target.value])} placeholder={isDate ? undefined : "Max"} className="h-8 text-xs border-slate-100" disabled={disabled} />
    </div>
  );
}
