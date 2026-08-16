"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { createDashboard } from "@/lib/queries/analytics-dashboards";
import { listFolders, type FolderRow } from "@/lib/queries/analytics-folders";

export function NewDashboardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [visibility, setVisibility] = useState<"private" | "workspace">("workspace");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form each time the modal reopens
    setName("");
    setFolderId("");
    setVisibility("workspace");
    listFolders("dashboard").then(setFolders);
  }, [open]);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const created = await createDashboard({ name: name.trim(), folderId: folderId || null, visibility });
      if (created) {
        onClose();
        router.push(`/analytics/dashboards/${created.id}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New dashboard" size="sm">
      <div className="p-5 space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q1 Sales Overview" autoFocus />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Category</label>
          <Select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">Uncategorized</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Visibility</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVisibility("workspace")}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium text-left ${visibility === "workspace" ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}
            >
              Shared<br /><span className="font-normal text-slate-400">Whole workspace can see it</span>
            </button>
            <button
              type="button"
              onClick={() => setVisibility("private")}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium text-left ${visibility === "private" ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}
            >
              Private<br /><span className="font-normal text-slate-400">Only you can see it</span>
            </button>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!name.trim() || saving} onClick={handleCreate}>
            {saving ? "Creating…" : "Create dashboard"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
