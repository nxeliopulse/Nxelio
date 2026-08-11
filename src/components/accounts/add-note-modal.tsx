"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FolderOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { createAccountNote } from "@/lib/queries/account-notes";

const fieldStyle = "w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)]";
const labelStyle = "block text-xs font-bold text-slate-700 dark:text-slate-600 mb-1.5";

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "Add New Notes" modal — Title + Note + drag-and-drop file attachment(s).
 *  Real save (account_notes), matching add-deal-modal.tsx's centered pattern. */
export function AddNoteModal({ open, onClose, accountId }: { open: boolean; onClose: () => void; accountId: string }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function reset() {
    setTitle("");
    setNote("");
    setFiles([]);
    setError(null);
  }

  function handleClose() {
    if (saving) return;
    reset();
    onClose();
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list)]);
  }

  async function save() {
    if (!title.trim()) { setError("Title is required."); return; }
    if (!note.trim()) { setError("Note is required."); return; }
    if (files.length === 0) { setError("An attachment is required."); return; }
    setError(null);
    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("title", title.trim());
      formData.set("body", note.trim());
      files.forEach((f) => formData.append("files", f));
      const res = await createAccountNote(accountId, formData);
      if (!res.ok) { setError(res.error || "Couldn't save note."); return; }
      toast("Note added.", "success");
      reset();
      onClose();
      router.refresh();
    } catch {
      setError("Couldn't save note. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/45 backdrop-blur-xs z-50" onClick={handleClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-bold text-base text-slate-900 dark:text-white">Add New Notes</h2>
            <button onClick={handleClose} className="text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg p-1.5">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {error && <p className="text-xs font-bold text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-400 p-2 rounded-lg">{error}</p>}

            <div>
              <label className={labelStyle}>Title <span className="text-red-500">*</span></label>
              <input className={fieldStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div>
              <label className={labelStyle}>Note <span className="text-red-500">*</span></label>
              <textarea rows={4} className={fieldStyle + " resize-y"} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div>
              <label className={labelStyle}>Attachment <span className="text-red-500">*</span></label>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
                className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${dragging ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[var(--muted)]"}`}
              >
                <FolderOpen className="h-6 w-6 text-rose-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Drop your files here or{" "}
                  <button type="button" onClick={() => fileRef.current?.click()} className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                    browse
                  </button>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Maximum size : 50 MB</p>
                <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
              </div>
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="h-8 w-8 rounded bg-emerald-500 flex items-center justify-center text-white flex-shrink-0">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-600 truncate">{f.name}</p>
                      <p className="text-[10px] text-slate-400">{formatFileSize(f.size)}</p>
                    </div>
                    <button type="button" onClick={() => setFiles((cur) => cur.filter((_, idx) => idx !== i))} className="p-1 text-slate-400 hover:text-rose-600 flex-shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
