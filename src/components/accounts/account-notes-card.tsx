"use client";
import { useState, useTransition } from "react";
import DOMPurify from "isomorphic-dompurify";
import { ChevronDown, FileText, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { AddNoteModal } from "@/components/accounts/add-note-modal";
import { cn } from "@/lib/utils";
import { useFeedback } from "@/components/ui/feedback";
import { addAccountNoteComment, deleteAccountNote, updateAccountNote, type AccountNoteRow } from "@/lib/queries/account-notes";
import { formatDateTime } from "@/lib/utils";

const AVATAR_COLORS = ["bg-teal-500", "bg-blue-500", "bg-purple-500", "bg-amber-500", "bg-rose-500", "bg-emerald-500"];
const SANITIZE_OPTS = { ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li", "span", "h1", "h2", "h3"], ALLOWED_ATTR: ["href", "target", "rel", "style"] };

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash);
}

function avatarColor(name: string): string {
  return AVATAR_COLORS[hashCode(name) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Note bodies are HTML from the rich text editor — sanitize before rendering
 *  with dangerouslySetInnerHTML. Runs client-side too (defense in depth on top
 *  of the server-side sanitize in account-notes.ts), and safely handles older
 *  plain-text notes that might contain literal "<"/">" characters. */
function safeHtml(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_OPTS);
}

/** Notes logged against an account — with multiple file attachments and threaded
 *  replies per note (account_note_files / account_note_comments, 0108), and rich
 *  text bodies via the same TipTap editor used in the newsletter builder. */
export function AccountNotesCard({ accountId, notes }: { accountId: string; notes: AccountNoteRow[] }) {
  const { confirm } = useFeedback();
  const [sortDir, setSortDir] = useState<"newest" | "oldest">("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [, start] = useTransition();

  const sorted = [...notes].sort((a, b) =>
    (sortDir === "newest" ? 1 : -1) * (new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  );

  async function handleDelete(id: string) {
    const ok = await confirm({ title: "Delete note?", message: "This can't be undone.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    start(async () => {
      await deleteAccountNote(id, accountId);
    });
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80">
        <h5 className="font-bold text-slate-800 dark:text-slate-700 text-xs">Notes</h5>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setSortOpen((v) => !v)} className="h-7 text-[11px] px-2.5 gap-1">
              Sort By <ChevronDown className="h-3 w-3" />
            </Button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-28 rounded-lg border border-slate-200 bg-white py-1 shadow-lg text-xs dark:bg-slate-900 dark:border-slate-800">
                  {(["newest", "oldest"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => { setSortDir(s); setSortOpen(false); }}
                      className={cn("w-full text-left px-3 py-2 capitalize hover:bg-slate-50 dark:hover:bg-[var(--muted)]", sortDir === s && "font-bold text-blue-600 dark:text-blue-400")}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={() => setAddOpen(true)} className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
            <Plus className="h-3 w-3" /> Add New
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-slate-400 italic pt-1 text-center py-4">No notes yet.</p>
      ) : (
        <ul className="space-y-3 pt-1">
          {sorted.map((n) => (
            <NoteItem key={n.id} note={n} accountId={accountId} onDelete={() => handleDelete(n.id)} />
          ))}
        </ul>
      )}

      <AddNoteModal open={addOpen} onClose={() => setAddOpen(false)} accountId={accountId} />
    </div>
  );
}

function NoteItem({ note, accountId, onDelete }: { note: AccountNoteRow; accountId: string; onDelete: () => void }) {
  const { toast } = useFeedback();
  const [menuOpen, setMenuOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(note.body);
  const [pending, start] = useTransition();
  const author = note.author_name || "Unknown";

  function submitReply() {
    if (!reply.trim()) return;
    start(async () => {
      const res = await addAccountNoteComment(note.id, accountId, reply.trim());
      if (!res.ok) { toast(res.error || "Couldn't add comment", "error"); return; }
      setReply("");
      setReplyOpen(false);
    });
  }

  function startEdit() {
    setEditBody(note.body);
    setEditing(true);
  }

  function saveEdit() {
    start(async () => {
      const res = await updateAccountNote(note.id, accountId, editBody);
      if (!res.ok) { toast(res.error || "Couldn't save note", "error"); return; }
      setEditing(false);
    });
  }

  return (
    <li className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 relative">
      <div className="flex items-start gap-2.5">
        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0", avatarColor(author))}>
          {initials(author)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-700">{author}</p>
              <p className="text-[10px] text-slate-400">{formatDateTime(note.created_at)}</p>
            </div>
            <div className="relative flex-shrink-0">
              <button onClick={() => setMenuOpen((v) => !v)} className="p-1 rounded text-slate-400 hover:bg-slate-50 dark:hover:bg-[var(--muted)]">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-32 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:bg-slate-900 dark:border-slate-800">
                    <button onClick={() => { setMenuOpen(false); startEdit(); }} className="w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-[var(--muted)]">
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button onClick={() => { setMenuOpen(false); onDelete(); }} className="w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {note.title && !editing && <p className="font-bold text-slate-800 dark:text-slate-700 mt-1.5">{note.title}</p>}

          {editing ? (
            <div className="mt-1.5 space-y-2">
              <RichTextEditor value={editBody} onChange={setEditBody} minHeight={90} toolbar="compact" />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={pending} className="h-7 text-[11px]">Cancel</Button>
                <Button size="sm" onClick={saveEdit} disabled={pending} className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700 text-white">Save</Button>
              </div>
            </div>
          ) : (
            <div className="text-slate-700 dark:text-slate-600 mt-1 [&_p]:my-0 [&_a]:text-blue-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: safeHtml(note.body) }} />
          )}

          {note.files.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {note.files.map((f) => (
                <a
                  key={f.id}
                  href={f.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[var(--muted)] hover:border-blue-300 dark:hover:border-blue-500/50 max-w-[220px]"
                >
                  <span className="h-6 w-6 rounded bg-emerald-500 flex items-center justify-center text-white flex-shrink-0">
                    <FileText className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-slate-700 dark:text-slate-600 font-semibold truncate">{f.file_name || "Attachment"}</span>
                    {f.file_size != null && <span className="block text-[10px] text-slate-400">{formatFileSize(f.file_size)}</span>}
                  </span>
                </a>
              ))}
            </div>
          )}

          {note.comments.length > 0 && (
            <div className="mt-2.5 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-2.5">
              {note.comments.map((c) => (
                <div key={c.id} className="text-[11px]">
                  <p className="text-slate-600 dark:text-slate-500">{c.body}</p>
                  <p className="text-slate-400 mt-0.5">Commented by <span className="font-semibold text-slate-500">{c.author_name || "Unknown"}</span> on {formatDateTime(c.created_at)}</p>
                </div>
              ))}
            </div>
          )}

          {(replyOpen ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                autoFocus
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitReply(); }}
                placeholder="Write a reply…"
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500"
              />
              <Button size="sm" onClick={submitReply} disabled={pending || !reply.trim()} className="h-7 text-[11px]">Send</Button>
            </div>
          ) : (
            <button onClick={() => setReplyOpen(true)} className="mt-2 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              <Plus className="h-3 w-3" /> Add Comment
            </button>
          ))}
        </div>
      </div>
    </li>
  );
}
