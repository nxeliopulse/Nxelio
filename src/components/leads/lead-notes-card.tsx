"use client";
import { useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Paperclip, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { createLeadNote, deleteLeadNote, type LeadNoteRow } from "@/lib/queries/lead-notes";
import { formatDateTime } from "@/lib/utils";

/** Free-text notes (with an optional file attachment) logged against a lead —
 *  the real, existing-data equivalent of Salesforce's generic "Files" panel. */
export function LeadNotesCard({ leadId, notes }: { leadId: string; notes: LeadNoteRow[] }) {
  const { confirm, toast } = useFeedback();
  const [open, setOpen] = useState(true);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    if (!body.trim()) return;
    const formData = new FormData();
    formData.set("body", body.trim());
    if (file) formData.set("file", file);
    start(async () => {
      const res = await createLeadNote(leadId, formData);
      if (!res.ok) { toast(res.error || "Couldn't add note", "error"); return; }
      setBody("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: "Delete note?", message: "This can't be undone.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    start(async () => {
      await deleteLeadNote(id, leadId);
    });
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-left font-bold text-sm text-slate-800 dark:text-slate-200"
      >
        <span className="inline-flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
          Notes ({notes.length})
        </span>
        <Plus
          className="h-3.5 w-3.5 text-slate-400 hover:text-blue-600 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
            requestAnimationFrame(() => bodyRef.current?.focus());
          }}
        />
      </button>

      {open && (
        <div className="p-4 space-y-3 text-xs">
          <div className="space-y-2">
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Log a note about this lead…"
              rows={2}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <input
                  ref={fileRef}
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id={`note-file-${leadId}`}
                />
                <label
                  htmlFor={`note-file-${leadId}`}
                  className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer font-medium flex-shrink-0"
                >
                  <Paperclip className="h-3.5 w-3.5" /> Attach file
                </label>
                {file && (
                  <span className="inline-flex items-center gap-1 text-slate-500 truncate">
                    · {file.name}
                    <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="hover:text-rose-600">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
              <Button size="sm" onClick={submit} disabled={pending || !body.trim()} className="flex-shrink-0">
                Add note
              </Button>
            </div>
          </div>

          {notes.length === 0 ? (
            <p className="text-slate-400 italic pt-1">No notes yet.</p>
          ) : (
            <ul className="space-y-2 pt-1">
              {notes.map((n) => (
                <li key={n.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{n.body}</p>
                      {n.file_url && (
                        <a href={n.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1.5 text-blue-600 hover:underline font-medium">
                          <Paperclip className="h-3 w-3" /> {n.file_name || "Attachment"}
                        </a>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1.5">{n.author_name || "Unknown"} · {formatDateTime(n.created_at)}</p>
                    </div>
                    <button
                      onClick={() => handleDelete(n.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-rose-600 flex-shrink-0"
                      title="Delete note"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
