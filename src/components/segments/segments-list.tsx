"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Send,
  Workflow,
  Download,
  RefreshCw,
  UserPlus,
  Sparkles,
  Tags,
  Search,
  Trash2,
  Pencil,
  LayoutGrid,
  List,
  Users,
  CheckCircle2,
  Layers,
  ArrowUpRight,
  Zap,
  Copy,
  Archive,
  ArchiveRestore,
  History,
} from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd, DataTableEmpty } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { useFeedback } from "@/components/ui/feedback";
import { deleteSegment, exportSegmentCsv, refreshSegment, type SegmentRow, duplicateSegment, archiveSegment, restoreSegment } from "@/lib/queries/segments";
import { formatDate, cn } from "@/lib/utils";
import { SegmentHistoryModal } from "@/components/segments/segment-history-modal";

const typeColor: Record<string, "blue" | "purple" | "pink"> = {
  Dynamic: "blue",
  Static: "purple",
  Behavioral: "purple",
  Engagement: "pink",
};

const statusColor: Record<string, "success" | "warning" | "default" | "info"> = {
  Active: "success",
  Paused: "warning",
  Draft: "default",
  Archived: "info",
};

const SALES_REPS = ["Sarah", "Ryan", "Aisha"];
const TAG_SUGGESTIONS = ["Hot", "Engaged", "Cold"];

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function SegmentsList({ segments }: { segments: (SegmentRow & { contacts: number })[] }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignRep, setAssignRep] = useState(SALES_REPS[0]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [page, setPage] = useState(0);
  const [historySegmentId, setHistorySegmentId] = useState<string | null>(null);
  const PAGE_SIZE = 15;

  const filteredSegments = segments.filter((s) => {
    const matchesSearch =
      !search.trim() ||
      s.segment_name.toLowerCase().includes(search.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(search.toLowerCase()));
    const matchesType = typeFilter === "all" || s.segment_type.toLowerCase() === typeFilter.toLowerCase();
    // "all" means "all active statuses" — Archived only shows up once the
    // user explicitly filters for it, so it doesn't clutter the main list.
    const matchesStatus = statusFilter === "all" ? s.status !== "Archived" : s.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesType && matchesStatus;
  });
  const pageCount = Math.max(1, Math.ceil(filteredSegments.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedSegments = filteredSegments.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const totalContacts = segments.reduce((sum, s) => sum + (s.contacts || 0), 0);
  const activeCount = segments.filter((s) => s.status === "Active").length;
  const dynamicCount = segments.filter((s) => s.segment_type === "Dynamic").length;

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? filteredSegments.map((s) => s.id) : []);
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete segment?", message: "Delete this segment?", confirmLabel: "Delete", danger: true }))) return;
    start(async () => {
      await deleteSegment(id);
      setSelected((prev) => prev.filter((x) => x !== id));
    });
  }

  async function handleDuplicate(id: string, name: string) {
    start(async () => {
      await duplicateSegment(id);
      toast(`Duplicated "${name}" successfully`, "success");
      router.refresh();
    });
  }

  async function handleArchive(id: string, name: string) {
    if (!(await confirm({ title: "Archive segment?", message: `Archive "${name}"? It will be hidden from the active list but can be restored later.`, confirmLabel: "Archive" }))) return;
    start(async () => {
      await archiveSegment(id);
      toast(`"${name}" archived`, "success");
      router.refresh();
    });
  }

  async function handleRestore(id: string) {
    start(async () => {
      await restoreSegment(id);
      toast(`Segment restored`, "success");
      router.refresh();
    });
  }

  function handleRefresh(id: string, name: string) {
    start(async () => {
      const n = await refreshSegment(id);
      toast(`"${name}" refreshed — ${n.toLocaleString()} matching lead${n === 1 ? "" : "s"}`, "success");
      router.refresh();
    });
  }

  async function handleExportSelected() {
    for (const id of selected) {
      const { filename, csv } = await exportSegmentCsv(id);
      downloadCsv(filename, csv);
    }
  }

  function handleSendCampaign() {
    if (!selected[0]) return;
    router.push(`/campaigns/builder?segment=${selected[0]}`);
  }

  function handleStartWorkflow() {
    if (!selected[0]) return;
    router.push(`/workflows/builder?segment=${selected[0]}`);
  }

  function handleSyncCrm() {
    toast("CRM sync coming soon — connect HubSpot in Settings -> API Keys", "info");
  }

  function handleAiRecommend() {
    toast("AI is analyzing segments... (full AI integration in v2)", "info");
  }

  function saveAssign() {
    toast(`Assigned ${selected.length} segment(s) to ${assignRep}`, "success");
    setAssignOpen(false);
  }

  function saveTags() {
    const tag = tagInput.trim();
    if (!tag) {
      setTagsOpen(false);
      return;
    }
    toast(`Added tag "${tag}" to ${selected.length} segment(s)`, "success");
    setTagInput("");
    setTagsOpen(false);
  }

  const hasSelection = selected.length > 0;
  const allChecked = filteredSegments.length > 0 && selected.length === filteredSegments.length;

  const quickActions = [
    { label: "Send campaign", icon: <Send className="h-3.5 w-3.5" />, onClick: handleSendCampaign },
    { label: "Start workflow", icon: <Workflow className="h-3.5 w-3.5" />, onClick: handleStartWorkflow },
    { label: "Export CSV", icon: <Download className="h-3.5 w-3.5" />, onClick: handleExportSelected },
    { label: "Sync CRM", icon: <RefreshCw className="h-3.5 w-3.5" />, onClick: handleSyncCrm },
    { label: "Assign sales rep", icon: <UserPlus className="h-3.5 w-3.5" />, onClick: () => setAssignOpen(true) },
    { label: "AI recommendation", icon: <Sparkles className="h-3.5 w-3.5" />, onClick: handleAiRecommend },
    { label: "Add tags", icon: <Tags className="h-3.5 w-3.5" />, onClick: () => setTagsOpen(true) },
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <PageHeader
        title="Audience Segments"
        description="Organize leads into targeted groups for personalized campaigns and workflows"
        actions={
          <Link href="/segments/builder">
            <Button className="rounded-xl font-bold px-4 py-2.5 gap-2">
              <Plus className="h-4 w-4" /> Create Segment
            </Button>
          </Link>
        }
      />

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Segments</span>
            <div className="h-9 w-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Layers className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{segments.length}</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active Rules</span>
            <div className="h-9 w-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{activeCount}</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dynamic Rules</span>
            <div className="h-9 w-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Zap className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{dynamicCount}</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Segmented Contacts</span>
            <div className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{totalContacts.toLocaleString()}</p>
        </Card>
      </div>

      {/* Dynamic Bulk Action Bar when items selected */}
      {hasSelection && (
        <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/80 dark:bg-blue-950/50 p-4 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-600 text-white text-xs font-bold">
              {selected.length}
            </span>
            <p className="text-xs font-bold text-blue-900 dark:text-blue-200">segment{selected.length === 1 ? "" : "s"} selected</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {quickActions.map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-sm transition-all"
              >
                {a.icon} {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Card Container */}
      <Card className="overflow-hidden">
        {/* Toolbar: Search, Filters, View Switcher */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[240px]">
            {/* Search Input */}
            <div className="w-full sm:w-72">
              <Input
                leftIcon={<Search className="h-4 w-4 text-slate-400" />}
                placeholder="Search segments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 text-sm rounded-xl"
              />
            </div>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-[var(--primary)]/20 transition-all shadow-sm cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="dynamic">Dynamic</option>
              <option value="static">Static</option>
              <option value="behavioral">Behavioral</option>
              <option value="engagement">Engagement</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-[var(--primary)]/20 transition-all shadow-sm cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 p-1 bg-slate-50 dark:bg-slate-950/60">
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "p-1.5 rounded-lg text-xs font-semibold transition-all",
                viewMode === "table"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              )}
              title="Table View"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 rounded-lg text-xs font-semibold transition-all",
                viewMode === "grid"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              )}
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Area: Table vs Grid Cards */}
        {viewMode === "table" ? (
          <>
          <DataTable className="min-w-[760px]">
              <DataTableHead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                  <DataTableTh className="w-10">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 dark:border-slate-700"
                      checked={allChecked}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </DataTableTh>
                  <DataTableTh>Segment</DataTableTh>
                  <DataTableTh>Contacts</DataTableTh>
                  <DataTableTh>Type</DataTableTh>
                  <DataTableTh>Status</DataTableTh>
                  <DataTableTh>Created</DataTableTh>
                  <DataTableTh className="text-right">Actions</DataTableTh>
                </tr>
              </DataTableHead>
              <DataTableBody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {pagedSegments.length === 0 && (
                  <DataTableEmpty colSpan={7}>
                    No matching segments found. Click <strong className="text-slate-700 dark:text-slate-300">Create Segment</strong> to build a new target group.
                  </DataTableEmpty>
                )}
                {pagedSegments.map((s) => (
                  <DataTableRow key={s.id}>
                    <DataTableTd>
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 dark:border-slate-700"
                        checked={selected.includes(s.id)}
                        onChange={(e) => toggleOne(s.id, e.target.checked)}
                      />
                    </DataTableTd>
                    <DataTableTd>
                      <Link href={`/segments/builder?id=${s.id}`} className="block group">
                        <p className="font-semibold text-slate-900 dark:text-white group-hover:text-[var(--primary)] transition-colors">{s.segment_name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.description || "—"}</p>
                      </Link>
                    </DataTableTd>
                    <DataTableTd className="font-bold text-slate-900 dark:text-white tabular-nums">
                      {s.contacts.toLocaleString()}
                    </DataTableTd>
                    <DataTableTd>
                      <Badge variant={typeColor[s.segment_type] || "default"}>{s.segment_type}</Badge>
                    </DataTableTd>
                    <DataTableTd>
                      <Badge variant={statusColor[s.status] || "default"}>{s.status}</Badge>
                    </DataTableTd>
                    <DataTableTd className="text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{formatDate(s.created_at)}</DataTableTd>
                    <DataTableTd className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {s.segment_type !== "Static" && (
                          <button
                            onClick={() => handleRefresh(s.id, s.segment_name)}
                            disabled={pending}
                            title="Refresh contacts"
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        )}
                        <Link
                          href={`/segments/builder?id=${s.id}`}
                          title="Edit Segment"
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => setHistorySegmentId(s.id)}
                          title="View history"
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        >
                          <History className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDuplicate(s.id, s.segment_name)}
                          disabled={pending}
                          title="Duplicate Segment"
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        {s.status !== "Archived" ? (
                          <button
                            onClick={() => handleArchive(s.id, s.segment_name)}
                            disabled={pending}
                            title="Archive Segment"
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRestore(s.id)}
                            disabled={pending}
                            title="Restore Segment"
                            className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          >
                            <ArchiveRestore className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(s.id)}
                          disabled={pending}
                          title="Delete Segment"
                          className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </DataTableTd>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
            <Pagination page={safePage + 1} totalPages={pageCount} pageSize={PAGE_SIZE} totalItems={filteredSegments.length} onPageChange={(p) => setPage(p - 1)} />
          </>
        ) : (
          /* Grid View Cards */
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSegments.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-400 dark:text-slate-500 font-medium">
                No matching segments found.
              </div>
            )}
            {filteredSegments.map((s) => (
              <div
                key={s.id}
                className="rounded-[var(--card-radius)] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-[var(--primary)]/50 transition-all flex flex-col justify-between space-y-4 group shadow-[var(--card-shadow)]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Badge variant={typeColor[s.segment_type] || "default"}>{s.segment_type}</Badge>
                    <Badge variant={statusColor[s.status] || "default"}>{s.status}</Badge>
                  </div>
                  <Link href={`/segments/builder?id=${s.id}`}>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-[var(--primary)] transition-colors">{s.segment_name}</h3>
                  </Link>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{s.description || "No description provided."}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 font-medium block">Contacts</span>
                    <span className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{s.contacts.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDuplicate(s.id, s.segment_name)}
                      disabled={pending}
                      className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white mr-1"
                    >
                      Duplicate
                    </button>
                    {s.status !== "Archived" ? (
                      <button
                        onClick={() => handleArchive(s.id, s.segment_name)}
                        disabled={pending}
                        className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white mr-1"
                      >
                        Archive
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRestore(s.id)}
                        disabled={pending}
                        className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 mr-1"
                      >
                        Restore
                      </button>
                    )}
                    <Link
                      href={`/segments/builder?id=${s.id}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)] hover:underline ml-1"
                    >
                      Edit <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Assign sales rep modal */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign sales rep"
        description={`Assigning ${selected.length} segment(s)`}
        size="sm"
      >
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Sales rep</label>
            <Select value={assignRep} onChange={(e) => setAssignRep(e.target.value)}>
              {SALES_REPS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={saveAssign}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Add tags modal */}
      <Modal
        open={tagsOpen}
        onClose={() => setTagsOpen(false)}
        title="Add tags"
        description={`Tagging ${selected.length} segment(s)`}
        size="sm"
      >
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tag</label>
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Enter a tag name..."
            />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-2">Suggestions</p>
            <div className="flex gap-2 flex-wrap">
              {TAG_SUGGESTIONS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTagInput(t)}
                  className="px-2.5 py-1 rounded-full text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTagsOpen(false)}>Cancel</Button>
            <Button onClick={saveTags}>Save</Button>
          </div>
        </div>
      </Modal>

      {historySegmentId && (
        <SegmentHistoryModal
          segmentId={historySegmentId}
          onClose={() => setHistorySegmentId(null)}
        />
      )}
    </div>
  );
}
