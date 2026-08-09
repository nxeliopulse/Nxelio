"use client";
import { useState, useEffect } from "react";
import { Send, Sparkles, Loader2, AlertCircle, Info, CheckCircle2 } from "lucide-react";
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
            {draftPromptOpen ? (
              <Input
                autoFocus
                value={draftInstruction}
                onChange={(e) => setDraftInstruction(e.target.value)}
                onKeyDown={handleDraftInstructionSubmit}
                onBlur={() => { if (!draftInstruction.trim()) setDraftPromptOpen(false); }}
                placeholder="What should this email say? Press Enter…"
                className="h-7 text-xs max-w-[220px]"
              />
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setDraftPromptOpen(true)} disabled={drafting}>
                {drafting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Drafting...</> : <><Sparkles className="h-3.5 w-3.5" /> AI draft</>}
              </Button>
            )}
          </div>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Message</label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Write your message, or click 'AI draft' to generate one..." />
          <p className="text-xs text-slate-400 mt-1">Merge tags like {`{{firstName}}`} are supported.</p>
        </div>
      </div>

      <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
        <Button onClick={handleSend} disabled={sending || !leadEmail}>
          {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</> : <><Send className="h-4 w-4" /> Send email</>}
        </Button>
      </div>
    </Modal>
  );
}
