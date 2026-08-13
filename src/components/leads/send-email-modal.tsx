"use client";
import { useState, useEffect } from "react";
import { Send, Sparkles, Loader2, AlertCircle, Info, CheckCircle2, X, Lock } from "lucide-react";
import { useFeatureKillSwitch } from "@/lib/hooks/use-feature-kill-switch";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sendLeadEmail, hasSentEmailToLead } from "@/lib/email/actions";
import { generateLeadOutreach } from "@/lib/ai/actions";
import { notifyCreditsChanged } from "@/lib/credits-refresh";
import { useFeedback } from "@/components/ui/feedback";

interface Props {
  open: boolean;
  onClose: () => void;
  leadId: string;
  leadEmail: string | null;
  leadName: string;
}

export function SendEmailModal({ open, onClose, leadId, leadEmail, leadName }: Props) {
  const { toast } = useFeedback();
  const { enabled: sendEmailEnabled } = useFeatureKillSwitch("send_email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadySent, setAlreadySent] = useState(false);

  // AI draft — asking for the user's own instruction before generating,
  // instead of always writing the same generic sequence-opener text.
  const [draftPromptOpen, setDraftPromptOpen] = useState(false);
  const [draftInstruction, setDraftInstruction] = useState("");

  // The modal stays mounted between opens (just toggled via `open`), so without
  // this the previous send's subject/body would still be showing the next
  // time it's reopened for the same or a different lead. Also checks whether
  // this lead has already been emailed, to show the "already sent" badge.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form each time the modal reopens, not a mount-only init
      setSubject("");
      setBody("");
      setError(null);
      setDraftPromptOpen(false);
      setDraftInstruction("");
      hasSentEmailToLead(leadId).then(setAlreadySent).catch(() => setAlreadySent(false));
    }
  }, [open, leadId]);

  async function runDraft(instruction?: string) {
    setDrafting(true);
    setError(null);
    try {
      const seq = await generateLeadOutreach(leadId, instruction);
      if (seq[0]) {
        setSubject(seq[0].subject);
        setBody(seq[0].body);
      }
      notifyCreditsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft failed");
    } finally {
      setDrafting(false);
      setDraftPromptOpen(false);
      setDraftInstruction("");
    }
  }

  function handleDraftInstructionSubmit(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    runDraft(draftInstruction.trim() || undefined);
  }

  async function handleSend() {
    setError(null);
    if (!subject.trim() || !body.trim()) {
      setError("Subject and body are required");
      return;
    }
    setSending(true);
    try {
      const res = await sendLeadEmail(leadId, subject.trim(), body.trim());
      if (!res.ok) {
        setError(res.error || "Send failed");
        return;
      }
      toast(
        res.redirectedTo
          ? `Sent! (Sandbox mode — delivered to your test inbox ${res.redirectedTo} instead of the real lead.)`
          : "Email sent successfully!",
        "success"
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Email ${leadName}`} description={leadEmail || "No email on file"} size="md" variant="side">
      <div className="p-5 space-y-4">
        {alreadySent && (
          <Badge variant="info" className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> You already sent this lead an email</Badge>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          To: {leadEmail || "—"}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-slate-700">Subject</label>
            {!draftPromptOpen && (
              <Button variant="ghost" size="sm" onClick={() => setDraftPromptOpen(true)} disabled={drafting} className="font-semibold text-xs text-indigo-600 hover:text-indigo-750">
                {drafting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Drafting...</> : <><Sparkles className="h-3.5 w-3.5 animate-pulse" /> AI draft</>}
              </Button>
            )}
          </div>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" className="rounded-xl h-9.5 text-sm" />
        </div>

        {draftPromptOpen && (
          <div className="bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100/80 dark:border-indigo-900/50 rounded-xl p-3.5 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400 text-xs font-bold tracking-wider">
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-indigo-650 dark:text-indigo-400" />
                <span>AI EMAIL COMPOSER</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDraftPromptOpen(false);
                  setDraftInstruction("");
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="relative flex gap-2">
              <Input
                autoFocus
                value={draftInstruction}
                onChange={(e) => setDraftInstruction(e.target.value)}
                onKeyDown={handleDraftInstructionSubmit}
                placeholder="What should this email say? (e.g. Follow up on demo, introduce product)"
                className="flex-1 rounded-xl text-sm border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 h-10 shadow-sm"
              />
              <Button
                type="button"
                onClick={() => {
                  if (draftInstruction.trim()) {
                    runDraft(draftInstruction.trim());
                  }
                }}
                disabled={drafting || !draftInstruction.trim()}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 px-4 gap-1.5 cursor-pointer shadow-sm transition-all active:scale-98"
              >
                {drafting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Drafting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Draft</span>
                  </>
                )}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                "Follow up after meeting",
                "Introduce our product",
                "Schedule a demo call",
                "Send pricing proposal"
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setDraftInstruction(suggestion)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-350 hover:border-indigo-350 hover:text-indigo-655 dark:hover:border-indigo-700 dark:hover:text-indigo-400 transition-all cursor-pointer hover:shadow-xs"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Message</label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Write your message, or click 'AI draft' to generate one..." />
          <p className="text-xs text-slate-400 mt-1">Merge tags like {`{{firstName}}`} are supported.</p>
        </div>
      </div>

      <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
        <Button
          onClick={handleSend}
          disabled={!sendEmailEnabled || sending || !leadEmail}
          title={!sendEmailEnabled ? "Sending email has been temporarily disabled by the administrator." : undefined}
        >
          {sending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
            : !sendEmailEnabled
            ? <><Lock className="h-4 w-4" /> Send email</>
            : <><Send className="h-4 w-4" /> Send email</>}
        </Button>
      </div>
    </Modal>
  );
}
