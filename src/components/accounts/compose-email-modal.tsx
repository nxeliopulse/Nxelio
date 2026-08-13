"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useFeedback } from "@/components/ui/feedback";
import { sendAccountEmail, saveAccountEmailDraft, deleteAccountEmail, type AccountEmailRow } from "@/lib/queries/account-emails";
import { useFeatureKillSwitch } from "@/lib/hooks/use-feature-kill-switch";

const fieldStyle = "w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]/35 focus:border-[var(--primary)] placeholder-slate-400";

/** Compose/edit an email for an account — Send (real send via the configured
 *  provider), Draft (saves without sending, reopen later), Delete (discards
 *  the draft, or just clears an unsaved compose). Cc/Bcc are sent but not
 *  stored in history — only the primary To is kept (see account-emails.ts). */
export function ComposeEmailModal({
  open,
  onClose,
  accountId,
  defaultTo,
  draft,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
  defaultTo: string | null;
  draft?: AccountEmailRow | null;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const { enabled: sendEmailEnabled } = useFeatureKillSwitch("send_email");
  const [to, setTo] = useState(draft?.to_email || defaultTo || "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(draft?.subject || "");
  const [body, setBody] = useState(draft?.body || "");
  const [busy, setBusy] = useState<"send" | "draft" | "delete" | null>(null);

  if (!open) return null;

  function reset() {
    setTo(defaultTo || "");
    setCc("");
    setBcc("");
    setSubject("");
    setBody("");
  }

  async function handleSend() {
    setBusy("send");
    try {
      const res = await sendAccountEmail(accountId, { to, cc, bcc, subject, body });
      if (!res.ok) { toast(res.error || "Couldn't send email.", "error"); return; }
      if (draft) await deleteAccountEmail(draft.id, accountId);
      toast(res.simulated ? "Email logged (sending is simulated in this environment)." : "Email sent.", "success");
      reset();
      onClose();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleDraft() {
    setBusy("draft");
    try {
      const res = await saveAccountEmailDraft(accountId, { to, cc, bcc, subject, body }, draft?.id);
      if (!res.ok) { toast(res.error || "Couldn't save draft.", "error"); return; }
      toast("Draft saved.", "success");
      reset();
      onClose();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setBusy("delete");
    try {
      if (draft) {
        const res = await deleteAccountEmail(draft.id, accountId);
        if (!res.ok) { toast(res.error || "Couldn't delete draft.", "error"); return; }
        toast("Draft deleted.", "success");
        router.refresh();
      }
      reset();
      onClose();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/45 backdrop-blur-xs z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-900 dark:text-white">Compose Email</h2>
            <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <input className={fieldStyle} placeholder="To" value={to} onChange={(e) => setTo(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <input className={fieldStyle} placeholder="Cc" value={cc} onChange={(e) => setCc(e.target.value)} />
              <input className={fieldStyle} placeholder="Bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} />
            </div>
            <input className={fieldStyle} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <RichTextEditor value={body} onChange={setBody} toolbar="compact" minHeight={110} />
          </div>
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <Button
              onClick={handleSend}
              disabled={!sendEmailEnabled || busy !== null}
              title={!sendEmailEnabled ? "Sending email has been temporarily disabled by the administrator." : undefined}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {busy === "send" ? "Sending…" : !sendEmailEnabled ? (<><Lock className="h-3.5 w-3.5" /> Send</>) : "Send"}
            </Button>
            <Button variant="outline" onClick={handleDraft} disabled={busy !== null}>
              {busy === "draft" ? "Saving…" : "Draft"}
            </Button>
            <Button variant="outline" onClick={handleDelete} disabled={busy !== null} className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-400 dark:hover:bg-rose-950/30">
              {busy === "delete" ? "…" : "Delete"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
