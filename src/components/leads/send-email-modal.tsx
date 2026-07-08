"use client";
import { useState } from "react";
import { Send, Sparkles, Loader2, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sendLeadEmail } from "@/lib/email/actions";
import { generateLeadOutreach } from "@/lib/ai/actions";

interface Props {
  open: boolean;
  onClose: () => void;
  leadId: string;
  leadEmail: string | null;
  leadName: string;
}

export function SendEmailModal({ open, onClose, leadId, leadEmail, leadName }: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleDraft() {
    setDrafting(true);
    setError(null);
    try {
      const seq = await generateLeadOutreach(leadId);
      if (seq[0]) {
        setSubject(seq[0].subject);
        setBody(seq[0].body);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  }

  async function handleSend() {
    setError(null);
    setSuccess(null);
    if (!subject.trim() || !body.trim()) {
      setError("Subject and body are required");
      return;
    }
    setSending(true);
    try {
      const res = await sendLeadEmail(leadId, subject.trim(), body.trim());
      if (!res.ok) {
        setError(res.error || "Send failed");
      } else if (res.redirectedTo) {
        setSuccess(`Sent! (Sandbox mode — delivered to your test inbox ${res.redirectedTo} instead of the real lead. Verify a domain to send to leads.)`);
      } else {
        setSuccess("Email sent successfully!");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Email ${leadName}`} description={leadEmail || "No email on file"} size="md">
      <div className="p-5 space-y-4">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{success}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          To: {leadEmail || "—"}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-slate-700">Subject</label>
            <Button variant="ghost" size="sm" onClick={handleDraft} disabled={drafting}>
              {drafting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Drafting...</> : <><Sparkles className="h-3.5 w-3.5" /> AI draft</>}
            </Button>
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
