"use client";
import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type DragEvent,
  memo,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  GripVertical,
  Layers,
  Plus,
  Trash2,
  X,
  Undo2,
  Redo2,
  ChevronsUpDown,
  AlertTriangle,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  SEGMENT_FIELDS,
  operatorsForField,
  fieldType,
  newCondition,
  newGroup,
  isConditionComplete,
  encodeRange,
  decodeRange,
  type RuleNode,
  type Group,
  type GroupOperator,
  type Condition,
} from "@/lib/segments";

// ---------------------------------------------------------------------------
// Attribute Categories
// ---------------------------------------------------------------------------
export const ATTRIBUTE_CATEGORIES = [
  {
    id: "prospect",
    label: "Prospect Attributes",
    keys: ["status", "lead_score", "created_at", "updated_at", "verified"],
  },
  {
    id: "company",
    label: "Company Attributes",
    keys: ["company_name", "industry", "company_size", "country"],
  },
  {
    id: "ai",
    label: "AI Attributes",
    keys: ["interest_area", "seniority", "job_title"],
  },
  {
    id: "engagement",
    label: "Engagement Attributes",
    keys: ["source", "owner_id"],
  },
];

// ---------------------------------------------------------------------------
// Undo / Redo history
// ---------------------------------------------------------------------------
function useUndoRedo(current: Group, setCurrent: (g: Group) => void) {
  const past = useRef<Group[]>([]);
  const future = useRef<Group[]>([]);
  const ignoreNext = useRef(false);
  // canUndo/canRedo must be state (not ref reads) so the toolbar re-renders.
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const push = useCallback(
    (next: Group) => {
      if (ignoreNext.current) {
        ignoreNext.current = false;
        setCurrent(next);
        return;
      }
      past.current = [...past.current.slice(-49), current];
      future.current = [];
      setCanUndo(true);
      setCanRedo(false);
      setCurrent(next);
    },
    [current, setCurrent],
  );

  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    const prev = past.current[past.current.length - 1];
    past.current = past.current.slice(0, -1);
    future.current = [...future.current, current];
    ignoreNext.current = true;
    setCanUndo(past.current.length > 0);
    setCanRedo(true);
    setCurrent(prev);
  }, [current, setCurrent]);

  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    const next = future.current[future.current.length - 1];
    future.current = future.current.slice(0, -1);
    past.current = [...past.current, current];
    ignoreNext.current = true;
    setCanUndo(true);
    setCanRedo(future.current.length > 0);
    setCurrent(next);
  }, [current, setCurrent]);

  return { push, undo, redo, canUndo, canRedo };
}

// ---------------------------------------------------------------------------
// Immutable tree helpers
// ---------------------------------------------------------------------------
function updateAtPath(root: Group, path: number[], fn: (n: RuleNode) => RuleNode): Group {
  if (path.length === 0) return fn(root) as Group;
  const [idx, ...rest] = path;
  return { ...root, children: root.children.map((c, i) => (i !== idx ? c : rest.length === 0 ? fn(c) : updateAtPath(c as Group, rest, fn))) };
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
function insertAtPath(root: Group, path: number[], index: number, node: RuleNode): Group {
  if (path.length === 0) {
    const children = [...root.children];
    children.splice(index, 0, node);
    return { ...root, children };
  }
  const [idx, ...rest] = path;
  return { ...root, children: root.children.map((c, i) => (i === idx ? insertAtPath(c as Group, rest, index, node) : c)) };
}
function getAtPath(root: Group, path: number[]): RuleNode {
  if (path.length === 0) return root;
  const [idx, ...rest] = path;
  const child = root.children[idx];
  return rest.length === 0 ? child : getAtPath(child as Group, rest);
}
function deepClone(node: RuleNode): RuleNode {
  return JSON.parse(JSON.stringify(node));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
interface ValidationIssue { path: string; message: string; }

function validateTree(node: RuleNode, path: number[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const key = path.join("-") || "root";
  if (node.disabled) return issues;
  if (node.type === "group") {
    if (node.children.length === 0) {
      issues.push({ path: key, message: "Empty group — add at least one condition" });
    }
    node.children.forEach((child, i) => {
      issues.push(...validateTree(child, [...path, i]));
    });
  } else {
    if (node.field && node.operator && !isConditionComplete(node)) {
      issues.push({ path: key, message: "Missing value" });
    }
  }
  return issues;
}

function issuesForPath(issues: ValidationIssue[], path: number[]): string[] {
  const key = path.join("-") || "root";
  return issues.filter((i) => i.path === key).map((i) => i.message);
}

// ---------------------------------------------------------------------------
// Group styling
// ---------------------------------------------------------------------------
const GROUP_STYLE: Record<GroupOperator, { label: string; badge: "success" | "warning" | "danger"; border: string; bg: string; dot: string }> = {
  ALL: { label: "ALL match", badge: "success", border: "border-emerald-200 dark:border-emerald-800", bg: "bg-emerald-50/40 dark:bg-emerald-950/20", dot: "bg-emerald-500" },
  ANY: { label: "ANY match", badge: "warning", border: "border-amber-200 dark:border-amber-800", bg: "bg-amber-50/40 dark:bg-amber-950/20", dot: "bg-amber-500" },
  NOT: { label: "NOT (exclude)", badge: "danger", border: "border-rose-200 dark:border-rose-800", bg: "bg-rose-50/40 dark:bg-rose-950/20", dot: "bg-rose-500" },
};

// ---------------------------------------------------------------------------
// DnD Payload
// ---------------------------------------------------------------------------
interface DragPayload {
  kind: "field" | "move";
  fieldKey?: string;
  sourcePath?: number[];
}

let activeDrag: DragPayload | null = null;

// ---------------------------------------------------------------------------
// Visual Builder Component
// ---------------------------------------------------------------------------
export function VisualBuilder({
  root,
  setRoot,
  valueOptionsFor,
}: {
  root: Group;
  setRoot: (g: Group | ((prev: Group) => Group)) => void;
  valueOptionsFor: (field: string) => { value: string; label: string }[] | null;
}) {
  const { push, undo, redo, canUndo, canRedo } = useUndoRedo(root, (g) => setRoot(g));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const issues = useMemo(() => validateTree(root), [root]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [validationBanner, setValidationBanner] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) { e.preventDefault(); redo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "y") { e.preventDefault(); redo(); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [undo, redo]);

  const toggleCollapse = useCallback((key: string) => {
    setCollapsed((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }, []);
  const collapseAll = useCallback(() => {
    const keys = new Set<string>();
    function walk(node: RuleNode, path: number[]) {
      if (node.type === "group") { keys.add(path.join("-") || "root"); node.children.forEach((c, i) => walk(c, [...path, i])); }
    }
    walk(root, []);
    setCollapsed(keys);
  }, [root]);
  const expandAll = useCallback(() => setCollapsed(new Set()), []);

  const editTree = useCallback((fn: (r: Group) => Group) => {
    const next = fn(root);
    push(next);
  }, [root, push]);

  // Click to add attribute from palette
  const handleAddAttribute = useCallback((fieldKey: string) => {
    const cond = newCondition(fieldKey);
    editTree((r) => addChildAtPath(r, [], cond));
  }, [editTree]);

  // Drop handler
  const handleDrop = useCallback(
    (targetPath: number[], insertIdx?: number) => {
      if (!activeDrag) return;
      if (activeDrag.kind === "field" && activeDrag.fieldKey) {
        const cond = newCondition(activeDrag.fieldKey);
        editTree((r) => insertIdx != null ? insertAtPath(r, targetPath, insertIdx, cond) : addChildAtPath(r, targetPath, cond));
      }
      if (activeDrag.kind === "move" && activeDrag.sourcePath) {
        const srcPath = activeDrag.sourcePath;
        const srcStr = srcPath.join(",");
        const tgtStr = targetPath.join(",");
        if (tgtStr.startsWith(srcStr)) return;
        const node = deepClone(getAtPath(root, srcPath));
        editTree((r) => {
          const removed = removeAtPath(r, srcPath);
          return insertIdx != null ? insertAtPath(removed, targetPath, insertIdx, node) : addChildAtPath(removed, targetPath, node);
        });
      }
      activeDrag = null;
      setDropTarget(null);
    },
    [root, editTree],
  );

  return (
    <div className="flex gap-4 min-h-[400px]">
      {/* ── Attributes Library Sidebar ── */}
      <FieldPalette onAddAttribute={handleAddAttribute} />

      {/* ── Main Canvas ── */}
      <div className="flex-1 space-y-3">
        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </Button>
          <Button variant="outline" size="sm" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            <Redo2 className="h-3.5 w-3.5" /> Redo
          </Button>
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <Button variant="outline" size="sm" onClick={collapseAll} title="Collapse all groups">
            <ChevronsUpDown className="h-3.5 w-3.5" /> Collapse all
          </Button>
          <Button variant="outline" size="sm" onClick={expandAll} title="Expand all groups">
            <Layers className="h-3.5 w-3.5" /> Expand all
          </Button>
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setValidationBanner((v) => !v)}
            className={cn(issues.length > 0 ? "border-amber-300 text-amber-700 hover:bg-amber-50" : "text-emerald-700 border-emerald-300 hover:bg-emerald-50")}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Validate Rules
          </Button>
          {issues.length > 0 && (
            <span className="ml-auto text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" /> {issues.length} issue{issues.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {/* Validation Summary Banner */}
        {validationBanner && (
          <div className={cn("p-3 rounded-xl border text-xs space-y-1", issues.length > 0 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-800")}>
            <div className="flex items-center justify-between font-bold">
              <span>{issues.length > 0 ? `Found ${issues.length} validation issues:` : "All rules are valid and ready to evaluate!"}</span>
              <button onClick={() => setValidationBanner(false)} className="hover:opacity-70"><X className="h-4 w-4" /></button>
            </div>
            {issues.map((iss, i) => (
              <p key={i} className="flex items-center gap-1.5">• <span className="font-semibold">{iss.path}:</span> {iss.message}</p>
            ))}
          </div>
        )}

        {/* Canvas container */}
        <GroupContainerMemo
          group={root}
          path={[]}
          isRoot
          collapsed={collapsed}
          toggleCollapse={toggleCollapse}
          editTree={editTree}
          handleDrop={handleDrop}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          issues={issues}
          valueOptionsFor={valueOptionsFor}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Categorized Attributes Library
// ---------------------------------------------------------------------------
const FieldPalette = memo(function FieldPalette({ onAddAttribute }: { onAddAttribute: (key: string) => void }) {
  const [search, setSearch] = useState("");
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  const toggleCategory = (catId: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const categories = useMemo(() => {
    return ATTRIBUTE_CATEGORIES.map((cat) => {
      const fields = SEGMENT_FIELDS.filter(
        (f) => cat.keys.includes(f.key) && (!search.trim() || f.label.toLowerCase().includes(search.toLowerCase()))
      );
      return { ...cat, fields };
    }).filter((cat) => cat.fields.length > 0);
  }, [search]);

  return (
    <div className="w-60 flex-shrink-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-3 self-start sticky top-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Attribute Library</p>
      </div>
      <Input
        placeholder="Search attributes…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-xs"
      />

      <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-0.5">
        {categories.map((cat) => {
          const isCollapsed = collapsedCats.has(cat.id);
          return (
            <div key={cat.id} className="space-y-1">
              <button
                onClick={() => toggleCategory(cat.id)}
                className="w-full flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300 py-1 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <span>{cat.label}</span>
                {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
              </button>

              {!isCollapsed && (
                <div className="space-y-0.5 pl-1">
                  {cat.fields.map((f) => (
                    <div
                      key={f.key}
                      draggable
                      onDragStart={(e) => {
                        activeDrag = { kind: "field", fieldKey: f.key };
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData("text/plain", f.key);
                      }}
                      onDragEnd={() => { activeDrag = null; }}
                      className="group flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-grab active:cursor-grabbing transition-all select-none"
                aria-selected={false}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <GripVertical className="h-3 w-3 text-slate-400 flex-shrink-0" />
                        <span className="truncate">{f.label}</span>
                      </div>
                      <button
                        onClick={() => onAddAttribute(f.key)}
                        title="Click to add condition"
                        className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {categories.length === 0 && (
          <p className="text-xs text-slate-400 py-3 text-center">No matching attributes found</p>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Group Container
// ---------------------------------------------------------------------------
interface GroupContainerProps {
  group: Group;
  path: number[];
  isRoot?: boolean;
  collapsed: Set<string>;
  toggleCollapse: (key: string) => void;
  editTree: (fn: (r: Group) => Group) => void;
  handleDrop: (targetPath: number[], insertIdx?: number) => void;
  dropTarget: string | null;
  setDropTarget: (key: string | null) => void;
  issues: ValidationIssue[];
  valueOptionsFor: (field: string) => { value: string; label: string }[] | null;
}

const GroupContainerMemo = memo(function GroupContainer({
  group, path, isRoot, collapsed, toggleCollapse, editTree, handleDrop, dropTarget, setDropTarget, issues, valueOptionsFor,
}: GroupContainerProps) {
  const key = path.join("-") || "root";
  const isCollapsed = collapsed.has(key);
  const style = GROUP_STYLE[group.operator];
  const myIssues = issuesForPath(issues, path);
  const isDropTarget = dropTarget === key;
  const isDisabled = group.disabled === true;

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = activeDrag?.kind === "field" ? "copy" : "move";
    setDropTarget(key);
  }, [key, setDropTarget]);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.stopPropagation();
    if (dropTarget === key) setDropTarget(null);
  }, [key, dropTarget, setDropTarget]);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleDrop(path);
    setDropTarget(null);
  }, [path, handleDrop, setDropTarget]);

  const conditionCount = group.children.length;
  const completeCount = group.children.filter(
    (c) => !c.disabled && (c.type === "condition" ? isConditionComplete(c) : true),
  ).length;

  return (
    <div
      className={cn(
        "rounded-xl border-2 transition-all relative",
        style.border,
        style.bg,
        isDisabled && "opacity-50 grayscale bg-slate-100/60 dark:bg-slate-900/60 border-slate-300",
        isDropTarget && "ring-2 ring-blue-400/50 border-blue-300 dark:border-blue-600",
        myIssues.length > 0 && !isDisabled && "ring-1 ring-amber-300",
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-3 pb-0">
        <button
          onClick={() => toggleCollapse(key)}
          className="p-0.5 rounded hover:bg-white/60 dark:hover:bg-slate-800/60 transition-colors"
          aria-label={isCollapsed ? "Expand group" : "Collapse group"}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
        </button>

        <Select
          value={group.operator}
          onChange={(e) =>
            editTree((r) => updateAtPath(r, path, (n) => ({ ...(n as Group), operator: e.target.value as GroupOperator })))
          }
          className="w-auto h-7 text-xs font-bold px-2"
          disabled={isDisabled}
        >
          <option value="ALL">ALL</option>
          <option value="ANY">ANY</option>
          <option value="NOT">NOT</option>
        </Select>

        <span className="text-xs text-slate-500 dark:text-slate-400">
          of the following {group.operator === "NOT" ? "are excluded" : "match"}
        </span>

        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto tabular-nums">
          {completeCount}/{conditionCount}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() =>
              editTree((r) => updateAtPath(r, path, (n) => ({ ...(n as Group), disabled: !isDisabled })))
            }
            className={cn("p-1 rounded-md transition-colors", isDisabled ? "text-amber-600 bg-amber-50" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100")}
            title={isDisabled ? "Enable group" : "Disable group"}
          >
            {isDisabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => editTree((r) => addChildAtPath(r, path, newCondition()))}
            className="p-1 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
            title="Add condition"
            disabled={isDisabled}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() =>
              editTree((r) => addChildAtPath(r, path, newGroup("ALL", [newCondition()])))
            }
            className="p-1 rounded-md text-slate-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors"
            title="Add nested group"
            disabled={isDisabled}
          >
            <Layers className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              const clone = deepClone(group);
              const parentPath = path.slice(0, -1);
              const idx = path[path.length - 1];
              editTree((r) => insertAtPath(r, parentPath.length ? parentPath : [], (idx ?? 0) + 1, clone));
            }}
            className={cn("p-1 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors", isRoot && "hidden")}
            title="Duplicate group"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          {!isRoot && (
            <button
              onClick={() => editTree((r) => removeAtPath(r, path))}
              className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              title="Remove group"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Warnings */}
      {myIssues.length > 0 && !isDisabled && (
        <div className="px-3 pt-1">
          {myIssues.map((msg, i) => (
            <p key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 flex-shrink-0" /> {msg}
            </p>
          ))}
        </div>
      )}

      {/* Children */}
      {!isCollapsed && (
        <div className="p-3 pt-2 space-y-1.5">
          {group.children.length === 0 && (
            <div
              className="rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 py-6 text-center text-xs text-slate-400 dark:text-slate-500"
              onDragOver={onDragOver}
              onDrop={onDrop}
            >
              Drag a field here or click <strong>+</strong> to add a condition
            </div>
          )}
          {group.children.map((child, idx) => {
            const childPath = [...path, idx];
            if (child.type === "condition") {
              return (
                <ConditionCardMemo
                  key={idx}
                  condition={child}
                  path={childPath}
                  editTree={editTree}
                  setDropTarget={setDropTarget}
                  handleDrop={handleDrop}
                  dropTarget={dropTarget}
                  issues={issues}
                  valueOptionsFor={valueOptionsFor}
                />
              );
            }
            return (
              <GroupContainerMemo
                key={idx}
                group={child}
                path={childPath}
                collapsed={collapsed}
                toggleCollapse={toggleCollapse}
                editTree={editTree}
                handleDrop={handleDrop}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
                issues={issues}
                valueOptionsFor={valueOptionsFor}
              />
            );
          })}
        </div>
      )}

      {isCollapsed && (
        <div className="px-3 pb-2 pt-1">
          <p className="text-xs text-slate-400 italic">
            {conditionCount} item{conditionCount === 1 ? "" : "s"} hidden
          </p>
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Condition Card
// ---------------------------------------------------------------------------
interface ConditionCardProps {
  condition: Condition;
  path: number[];
  editTree: (fn: (r: Group) => Group) => void;
  setDropTarget: (key: string | null) => void;
  handleDrop: (targetPath: number[], insertIdx?: number) => void;
  dropTarget: string | null;
  issues: ValidationIssue[];
  valueOptionsFor: (field: string) => { value: string; label: string }[] | null;
}

const ConditionCardMemo = memo(function ConditionCard({
  condition, path, editTree, setDropTarget, handleDrop, dropTarget, issues, valueOptionsFor,
}: ConditionCardProps) {
  const key = path.join("-");
  const myIssues = issuesForPath(issues, path);
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1];
  const isDropHere = dropTarget === `insert-${key}`;
  const fieldDef = SEGMENT_FIELDS.find((f) => f.key === condition.field);
  const options = valueOptionsFor(condition.field);
  const isDisabled = condition.disabled === true;

  const update = useCallback(
    (fn: (c: Condition) => Condition) => {
      editTree((r) => updateAtPath(r, path, (n) => fn(n as Condition)));
    },
    [editTree, path],
  );

  function changeField(field: string) {
    const ops = operatorsForField(field);
    update((c) => ({ ...c, field, operator: ops.some((o) => o.key === c.operator) ? c.operator : ops[0].key, value: "" }));
  }

  return (
    <>
      <div
        className={cn(
          "h-0.5 -my-0.5 rounded-full transition-all",
          isDropHere ? "bg-blue-400 h-1" : "bg-transparent",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropTarget(`insert-${key}`);
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDrop(parentPath, idx);
          setDropTarget(null);
        }}
      />

      <div
        className={cn(
          "flex items-center gap-2 bg-white dark:bg-slate-900 rounded-lg border p-1.5 transition-all group/card",
          isDisabled
            ? "opacity-50 grayscale bg-slate-50 dark:bg-slate-950 border-dashed border-slate-300"
            : myIssues.length > 0
              ? "border-amber-300 dark:border-amber-700"
              : "border-slate-200 dark:border-slate-800",
        )}
        draggable={!isDisabled}
        onDragStart={(e) => {
          activeDrag = { kind: "move", sourcePath: path };
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", key);
        }}
        onDragEnd={() => { activeDrag = null; setDropTarget(null); }}
      >
        <GripVertical className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 cursor-grab active:cursor-grabbing flex-shrink-0" />

        {/* Enable / Disable toggle */}
        <button
          onClick={() => update((c) => ({ ...c, disabled: !isDisabled }))}
          className={cn("p-1 rounded transition-colors flex-shrink-0", isDisabled ? "text-amber-600 bg-amber-50" : "text-slate-400 hover:text-slate-700")}
          title={isDisabled ? "Enable rule" : "Disable rule"}
        >
          {isDisabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>

        {/* Field */}
        <Select
          className="max-w-[150px] h-7 text-xs"
          value={condition.field}
          onChange={(e) => changeField(e.target.value)}
          disabled={isDisabled}
        >
          {SEGMENT_FIELDS.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </Select>

        {/* Operator */}
        <Select
          className="max-w-[140px] h-7 text-xs"
          value={condition.operator}
          onChange={(e) => update((c) => ({ ...c, operator: e.target.value, value: "" }))}
          disabled={isDisabled}
        >
          {operatorsForField(condition.field).map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </Select>

        {/* Value */}
        <ConditionValueInput condition={condition} onChange={update} options={options} fieldDef={fieldDef} disabled={isDisabled} />

        {/* Duplicate */}
        <button
          onClick={() => {
            const clone = deepClone(condition);
            editTree((r) => insertAtPath(r, parentPath, idx + 1, clone));
          }}
          className="p-1 rounded-md text-slate-400 opacity-0 group-hover/card:opacity-100 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex-shrink-0"
          title="Duplicate condition"
        >
          <Copy className="h-3 w-3" />
        </button>

        {/* Remove */}
        <button
          onClick={() => editTree((r) => removeAtPath(r, path))}
          className="p-1 rounded-md text-slate-400 opacity-0 group-hover/card:opacity-100 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all flex-shrink-0"
          title="Remove condition"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Inline validation */}
      {myIssues.length > 0 && !isDisabled && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 pl-6 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 flex-shrink-0" /> {myIssues[0]}
        </p>
      )}
    </>
  );
});

// ---------------------------------------------------------------------------
// Condition Value Input
// ---------------------------------------------------------------------------
function ConditionValueInput({
  condition,
  onChange,
  options,
  fieldDef,
  disabled,
}: {
  condition: Condition;
  onChange: (fn: (c: Condition) => Condition) => void;
  options: { value: string; label: string }[] | null;
  fieldDef: (typeof SEGMENT_FIELDS)[number] | undefined;
  disabled?: boolean;
}) {
  if (condition.operator === "is_true" || condition.operator === "is_false") {
    return <span className="flex-1 h-7 flex items-center text-xs text-slate-400 italic">No value needed</span>;
  }

  if (condition.operator === "between") {
    const [a, b] = decodeRange(condition.value);
    const isDate = fieldType(condition.field) === "date";
    return (
      <div className="flex-1 flex items-center gap-1">
        <Input
          type={isDate ? "date" : "number"}
          value={a}
          onChange={(e) => onChange((c) => ({ ...c, value: encodeRange(e.target.value, b) }))}
          placeholder={isDate ? undefined : "Min"}
          className="h-7 text-xs"
          disabled={disabled}
        />
        <span className="text-xs text-slate-400">–</span>
        <Input
          type={isDate ? "date" : "number"}
          value={b}
          onChange={(e) => onChange((c) => ({ ...c, value: encodeRange(a, e.target.value) }))}
          placeholder={isDate ? undefined : "Max"}
          className="h-7 text-xs"
          disabled={disabled}
        />
      </div>
    );
  }

  if (condition.operator === "in_last_days") {
    return (
      <div className="flex-1 flex items-center gap-1">
        <Input
          type="number"
          min={1}
          value={condition.value ?? ""}
          onChange={(e) => onChange((c) => ({ ...c, value: e.target.value }))}
          placeholder="7"
          className="h-7 text-xs"
          disabled={disabled}
        />
        <span className="text-xs text-slate-400 whitespace-nowrap">days</span>
      </div>
    );
  }

  if (fieldType(condition.field) === "date") {
    return (
      <Input
        type="date"
        value={condition.value ?? ""}
        onChange={(e) => onChange((c) => ({ ...c, value: e.target.value }))}
        className="flex-1 h-7 text-xs"
        disabled={disabled}
      />
    );
  }

  if (options) {
    return (
      <Select
        className="flex-1 h-7 text-xs"
        value={condition.value ?? ""}
        onChange={(e) => onChange((c) => ({ ...c, value: e.target.value }))}
        disabled={disabled}
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    );
  }

  return (
    <Input
      type={fieldType(condition.field) === "number" ? "number" : "text"}
      value={condition.value ?? ""}
      onChange={(e) => onChange((c) => ({ ...c, value: e.target.value }))}
      placeholder={fieldDef?.hint || "Value…"}
      className="flex-1 h-7 text-xs"
      disabled={disabled}
    />
  );
}
