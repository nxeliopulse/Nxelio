"use client";
import { useState, useTransition } from "react";
import { Check, FileSignature, MoreHorizontal, Trash2, Upload, User } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deleteContactDocument, markRecipientSigned, updateContactDocumentStatus, type ContactDocumentRow } from "@/lib/queries/contact-documents";
import { DOC_STATUSES, type DocStatus } from "@/lib/contact-documents-constants";
import type { OwnerOption } from "@/components/contacts/contacts-table";

const STATUS_STYLE: Record<DocStatus, string> = {
  Draft: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  Sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  Viewed: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  Signed: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
};

const TYPE_STYLE = "bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-400";

/** Real document tracker (contact_documents, 0101) — upload an existing
 *  quote/proposal/contract and track title/type/status/owner. No template
 *  builder or PDF generation. */
export function ContactDocumentsCard({ contactId, documents, owners, onAddNew }: { contactId: string; documents: ContactDocumentRow[]; owners: OwnerOption[]; onAddNew: () => void }) {
  function ownerName(id: string | null) {
    if (!id) return "Unassigned";
    return owners.find((o) => o.id === id)?.name || "Unassigned";
  }

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[var(--muted)] flex items-center justify-between gap-3">
        <div>
          <h5 className="font-bold text-slate-800 dark:text-slate-700 text-sm">Manage Documents</h5>
          <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-0.5">Upload and track quotes, proposals and contracts for this contact.</p>
        </div>
        <Button onClick={onAddNew} className="bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0 gap-1.5">
          <Upload className="h-3.5 w-3.5" /> Create Document
        </Button>
      </div>

      {documents.length === 0 ? (
        <p className="text-xs text-slate-400 italic text-center py-6">No documents yet.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => (
            <DocumentItem key={d.id} doc={d} contactId={contactId} ownerName={ownerName(d.owner_id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentItem({ doc, contactId, ownerName }: { doc: ContactDocumentRow; contactId: string; ownerName: string }) {
  const { confirm, toast } = useFeedback();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, start] = useTransition();

  function changeStatus(status: DocStatus) {
    start(async () => {
      const res = await updateContactDocumentStatus(doc.id, contactId, status);
      if (!res.ok) toast(res.error || "Couldn't update document", "error");
    });
  }

  function toggleSigned(recipientId: string, signed: boolean) {
    start(async () => {
      const res = await markRecipientSigned(recipientId, contactId, signed);
      if (!res.ok) toast(res.error || "Couldn't update recipient", "error");
    });
  }

  async function handleDelete() {
    setMenuOpen(false);
    const ok = await confirm({ title: "Delete document?", message: "This can't be undone.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    start(async () => {
      await deleteContactDocument(doc.id, contactId);
    });
  }

  return (
    <li className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {doc.file_url ? (
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-slate-800 dark:text-slate-700 hover:underline truncate block">
              {doc.title}
            </a>
          ) : (
            <p className="text-sm font-bold text-slate-800 dark:text-slate-700 truncate">{doc.title}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="h-5 w-5 rounded-full bg-slate-200 dark:bg-[var(--muted)] flex items-center justify-center text-slate-500 dark:text-slate-400 flex-shrink-0">
              <User className="h-3 w-3" />
            </div>
            <span className="text-[11px] text-slate-600 dark:text-slate-500">{ownerName}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">Owner</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", TYPE_STYLE)}>{doc.doc_type}</span>
          <select
            value={doc.status}
            disabled={pending}
            onChange={(e) => changeStatus(e.target.value as DocStatus)}
            className={cn("h-6 rounded-full border-none text-[10px] font-bold px-2 outline-none", STATUS_STYLE[doc.status])}
          >
            {DOC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:bg-slate-50 dark:hover:bg-[var(--muted)]">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-32 rounded-lg border border-slate-200 bg-white py-1 shadow-lg text-xs dark:bg-slate-900 dark:border-slate-800">
                  <button onClick={handleDelete} className="w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {doc.content && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 pl-0.5">{doc.content}</p>
      )}

      {doc.signature_required && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800">
          <p className="flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
            <FileSignature className="h-3 w-3" /> Manual signature tracking (not a real e-signature)
          </p>
          <div className="space-y-1">
            {doc.recipients.map((r) => (
              <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                <button
                  type="button"
                  onClick={() => toggleSigned(r.id, !r.signed)}
                  disabled={pending}
                  className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center flex-shrink-0",
                    r.signed ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 dark:border-slate-700 text-transparent"
                  )}
                >
                  <Check className="h-3 w-3" />
                </button>
                <span className="text-xs text-slate-700 dark:text-slate-500">{r.name} ({r.email})</span>
                <span className={cn("text-[10px] font-bold ml-auto", r.signed ? "text-emerald-600" : "text-slate-400")}>
                  {r.signed ? "Signed" : "Awaiting signature"}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}
