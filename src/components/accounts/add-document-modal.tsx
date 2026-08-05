"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { createAccountDocument } from "@/lib/queries/account-documents";
import { DOC_TYPES, DOC_STATUSES, type DocType, type DocStatus } from "@/lib/contact-documents-constants";
import type { AccountOwnerOption } from "@/components/accounts/edit-account-modal";
import type { OpportunityRow } from "@/lib/opportunities";

const fieldStyle =
  "w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)]";
const labelStyle = "block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5";

/** "Create New File" — real document tracking (file upload and/or typed
 *  Content, linked to a Deal), plus MANUAL signed-tracking with recipients.
 *  No real e-signature provider is integrated — recipients are just recorded
 *  for you to mark signed yourself once it's actually signed some other way. */
export function AddDocumentModal({ open, onClose, accountId, owners, deals = [] }: { open: boolean; onClose: () => void; accountId: string; owners: AccountOwnerOption[]; deals?: OpportunityRow[] }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [tab, setTab] = useState<"basic" | "recipients">("basic");
  const [dealId, setDealId] = useState("");
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<DocType>("Proposal");
  const [status, setStatus] = useState<DocStatus>("Draft");
  const [ownerId, setOwnerId] = useState("");
  const [needsSignature, setNeedsSignature] = useState(false);
  const [recipients, setRecipients] = useState<{ name: string; email: string }[]>([{ name: "", email: "" }]);
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setTab("basic");
    setDealId("");
    setTitle("");
    setDocType("Proposal");
    setStatus("Draft");
    setOwnerId("");
    setNeedsSignature(false);
    setRecipients([{ name: "", email: "" }]);
    setContent("");
    setFile(null);
    setError(null);
  }

  function handleClose() {
    if (saving) return;
    reset();
    onClose();
  }

  function updateRecipient(i: number, field: "name" | "email", value: string) {
    setRecipients((r) => r.map((rec, idx) => (idx === i ? { ...rec, [field]: value } : rec)));
  }

  async function save() {
    if (!title.trim()) { setError("Title is required."); setTab("basic"); return; }
    if (!content.trim() && !file) { setError("Add either Content or a file."); setTab("basic"); return; }
    const validRecipients = recipients.filter((r) => r.name.trim() && r.email.trim());
    if (needsSignature && validRecipients.length === 0) {
      setError("At least one recipient (name + email) is required for e-signature.");
      setTab("recipients");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("title", title.trim());
      formData.set("doc_type", docType);
      formData.set("status", status);
      formData.set("owner_id", ownerId);
      formData.set("opportunity_id", dealId);
      formData.set("content", content.trim());
      formData.set("signature_required", needsSignature ? "1" : "0");
      formData.set("recipients", JSON.stringify(validRecipients));
      if (file) formData.set("file", file);
      const res = await createAccountDocument(accountId, formData);
      if (!res.ok) { setError(res.error || "Couldn't create document."); return; }
      toast("Document created.", "success");
      reset();
      onClose();
      router.refresh();
    } catch {
      setError("Couldn't create document. Try again.");
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
            <h2 className="font-bold text-base text-slate-900 dark:text-white">Create New File</h2>
            <button onClick={handleClose} className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-full p-1.5">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 pb-0 flex items-center gap-2">
            <button
              onClick={() => setTab("basic")}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${tab === "basic" ? "bg-rose-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}
            >
              <FileText className="h-3.5 w-3.5" /> Basic Info
            </button>
            <button
              onClick={() => setTab("recipients")}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${tab === "recipients" ? "bg-rose-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}
            >
              <UserPlus className="h-3.5 w-3.5" /> Add Recipient
            </button>
          </div>

          <div className="p-4 space-y-3">
            {error && <p className="text-xs font-bold text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-400 p-2 rounded-lg">{error}</p>}

            {tab === "basic" ? (
              <>
                <div>
                  <label className={labelStyle}>Deal</label>
                  <select className={fieldStyle} value={dealId} onChange={(e) => setDealId(e.target.value)}>
                    <option value="">Select…</option>
                    {deals.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelStyle}>Document Type</label>
                    <select className={fieldStyle} value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
                      {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>Owner</label>
                    <select className={fieldStyle} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                      <option value="">-None-</option>
                      {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelStyle}>Title</label>
                  <input className={fieldStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Acme Corp Proposal" />
                </div>

                <div>
                  <label className={labelStyle}>Status</label>
                  <select className={fieldStyle} value={status} onChange={(e) => setStatus(e.target.value as DocStatus)}>
                    {DOC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[var(--muted)] space-y-2">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-700">Signature</h3>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="signature" checked={!needsSignature} onChange={() => setNeedsSignature(false)} className="mt-0.5 accent-rose-600" />
                    <span>
                      <span className="block text-xs font-semibold text-slate-700 dark:text-slate-600">No Signature</span>
                      <span className="block text-[11px] text-slate-400">This document does not require a signature before acceptance.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="signature" checked={needsSignature} onChange={() => setNeedsSignature(true)} className="mt-0.5 accent-rose-600" />
                    <span>
                      <span className="block text-xs font-semibold text-slate-700 dark:text-slate-600">Track manual signature</span>
                      <span className="block text-[11px] text-slate-400">Not a real e-signature — just records who needs to sign, marked by you once it&apos;s signed some other way.</span>
                    </span>
                  </label>
                </div>

                <div>
                  <label className={labelStyle}>Content</label>
                  <textarea rows={4} className={fieldStyle + " resize-y"} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Add Content" />
                  <p className="text-[11px] text-slate-400 mt-1">Type content directly, and/or attach a file below — at least one is required.</p>
                </div>

                <div>
                  <label className={labelStyle}>File</label>
                  <input type="file" className="hidden" id="doc-file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  <label htmlFor="doc-file" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-[var(--muted)] w-full">
                    {file ? file.name : "Choose file… (optional if Content is filled)"}
                  </label>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                {!needsSignature && (
                  <p className="text-xs text-slate-400 italic">Recipients only matter if you choose &quot;Track manual signature&quot; on the Basic Info tab.</p>
                )}
                {recipients.map((r, i) => (
                  <div key={i} className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <label className={labelStyle}>Recipients Name</label>
                      <input className={fieldStyle} value={r.name} onChange={(e) => updateRecipient(i, "name", e.target.value)} placeholder="Enter Name" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className={labelStyle}>Recipients Email</label>
                        <input className={fieldStyle} value={r.email} onChange={(e) => updateRecipient(i, "email", e.target.value)} placeholder="Email Address" />
                      </div>
                      {recipients.length > 1 && (
                        <button type="button" onClick={() => setRecipients((cur) => cur.filter((_, idx) => idx !== i))} className="p-2 text-slate-400 hover:text-rose-600 mb-0.5">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setRecipients((r) => [...r, { name: "", email: "" }])}
                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add another recipient
                </button>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-rose-600 hover:bg-rose-700 text-white">
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
