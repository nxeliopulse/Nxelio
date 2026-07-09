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
  MoreHorizontal,
  Search,
  Trash2,
  Pencil,
  Copy,
  Pause,
} from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { useFeedback } from "@/components/ui/feedback";
import { deleteSegment, exportSegmentCsv, refreshSegment, type SegmentRow } from "@/lib/queries/segments";
import { formatDate } from "@/lib/utils";

const typeColor: Record<string, "blue" | "purple" | "pink"> = {
  Dynamic: "blue",
  Static: "purple",
  Behavioral: "purple",
  Engagement: "pink",
};

const statusColor: Record<string, "success" | "warning" | "default"> = {
  Active: "success",
  Paused: "warning",
  Draft: "default",
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
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  // Fixed (viewport-relative) menu position so the dropdown isn't clipped by the
  // card's overflow-hidden / the table's horizontal scroll container.
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignRep, setAssignRep] = useState(SALES_REPS[0]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? segments.map((s) => s.id) : []);
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete segment?", message: "Delete this segment?", confirmLabel: "Delete", danger: true }))) return;
    start(async () => {
      await deleteSegment(id);
      setSelected((prev) => prev.filter((x) => x !== id));
    });
  }

  async function exportOne(id: string) {
    const { filename, csv } = await exportSegmentCsv(id);
    downloadCsv(filename, csv);
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
  const allChecked = segments.length > 0 && selected.length === segments.length;

  const quickActions = [
    { label: "Send campaign", icon: <Send className="h-3.5 w-3.5" />, onClick: handleSendCampaign },
    { label: "Start workflow", icon: <Workflow className="h-3.5 w-3.5" />, onClick: handleStartWorkflow },
    { label: "Export CSV", icon: <Download className="h-3.5 w-3.5" />, onClick: handleExportSelected },
    { label: "Sync to CRM", icon: <RefreshCw className="h-3.5 w-3.5" />, onClick: handleSyncCrm },
    { label: "Assign sales rep", icon: <UserPlus className="h-3.5 w-3.5" />, onClick: () => setAssignOpen(true) },
    { label: "AI recommendation", icon: <Sparkles className="h-3.5 w-3.5" />, onClick: handleAiRecommend },
    { label: "Add tags", icon: <Tags className="h-3.5 w-3.5" />, onClick: () => setTagsOpen(true) },
  ];

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="Audience Segments"
        description="Organize leads into targeted groups for personalized campaigns"
        actions={
          <Link href="/segments/builder">
            <Button><Plus className="h-4 w-4" /> Create Segment</Button>
          </Link>
        }
      />

      {/* Bulk action toolbar */}
      <Card className="p-3 mb-4">
        {hasSelection ? (
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-slate-500 mr-2 pl-2">
              {selected.length} selected:
            </p>
            {quickActions.map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm text-slate-700 hover:bg-slate-100"
              >
                {a.icon} {a.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 pl-2 py-1">
            Select a segment to use quick actions
          </p>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <div className="flex-1 max-w-md">
            <Input leftIcon={<Search className="h-4 w-4" />} placeholder="Search segments..." />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={allChecked}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th className="px-4 py-3 font-semibold">Segment</th>
                <th className="px-4 py-3 font-semibold">Contacts</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {segments.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-500">No segments yet. Click <strong>Create Segment</strong> to build your first one.</td></tr>
              )}
              {segments.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selected.includes(s.id)}
                      onChange={(e) => toggleOne(s.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/segments/builder?id=${s.id}`} className="block group">
                      <p className="font-medium text-slate-900 group-hover:text-blue-600">{s.segment_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{s.description || "—"}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-900">{s.contacts.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3"><Badge variant={typeColor[s.segment_type] || "default"}>{s.segment_type}</Badge></td>
                  <td className="px-4 py-3"><Badge variant={statusColor[s.status] || "default"}>{s.status}</Badge></td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(s.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end relative">
                      <button onClick={() => handleDelete(s.id)} disabled={pending} className="p-1.5 rounded-md hover:bg-red-50 text-red-500 disabled:opacity-50">
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          if (menuOpenId === s.id) { setMenuOpenId(null); return; }
                          const r = e.currentTarget.getBoundingClientRect();
                          setMenuPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
                          setMenuOpenId(s.id);
                        }}
                        className="p-1.5 rounded-md hover:bg-slate-100"
                      >
                        <MoreHorizontal className="h-4 w-4 text-slate-400" />
                      </button>
                      {menuOpenId === s.id && menuPos && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
                          <div className="fixed z-50 w-44 bg-white rounded-lg shadow-lg border border-slate-100 py-1 text-left" style={{ top: menuPos.top, right: menuPos.right }}>
                            <Link
                              href={`/segments/builder?id=${s.id}`}
                              onClick={() => setMenuOpenId(null)}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </Link>
                            <button
                              onClick={() => {
                                setMenuOpenId(null);
                                handleRefresh(s.id, s.segment_name);
                              }}
                              disabled={pending}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <RefreshCw className="h-3.5 w-3.5" /> Refresh members
                            </button>
                            <button
                              onClick={() => {
                                toast(`Duplicated "${s.segment_name}" (cosmetic)`, "info");
                                setMenuOpenId(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <Copy className="h-3.5 w-3.5" /> Duplicate
                            </button>
                            <button
                              onClick={() => {
                                toast(s.status === "Paused" ? "Resumed (cosmetic)" : "Paused (cosmetic)", "info");
                                setMenuOpenId(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <Pause className="h-3.5 w-3.5" />
                              {s.status === "Paused" ? "Resume" : "Pause"}
                            </button>
                            <button
                              onClick={() => {
                                exportOne(s.id);
                                setMenuOpenId(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <Download className="h-3.5 w-3.5" /> Export
                            </button>
                            <div className="border-t border-slate-100 my-1" />
                            <button
                              onClick={() => {
                                setMenuOpenId(null);
                                handleDelete(s.id);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Sales rep</label>
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
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Tag</label>
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
                  className="px-2.5 py-1 rounded-full text-xs bg-slate-100 hover:bg-slate-200 text-slate-700"
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
    </div>
  );
}
