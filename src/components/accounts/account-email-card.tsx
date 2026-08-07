"use client";
import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, FileEdit, Mail, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ComposeEmailModal } from "@/components/accounts/compose-email-modal";
import { ConnectAccountModal } from "@/components/contacts/connect-account-modal";
import { type AccountEmailRow } from "@/lib/queries/account-emails";
import { formatDateTime } from "@/lib/utils";

/** Real email send + history for an account — gated on a connected mailbox
 *  (same one Settings > Email uses), since sending real email needs a real
 *  sender account. Reuses inbox_messages (0112 added account_id, 0105 added
 *  to_email). Compose/draft/delete all happen in ComposeEmailModal. The
 *  "Connect Account" gate reuses the generic contacts/connect-account-modal
 *  (it's not contact-specific — same Unipile flow Settings > Email uses). */
export function AccountEmailCard({
  accountId, accountEmail, emails, mailboxConnected,
}: {
  accountId: string;
  accountEmail: string | null;
  emails: AccountEmailRow[];
  mailboxConnected: boolean;
}) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<AccountEmailRow | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

  function openCompose() {
    setEditingDraft(null);
    setComposeOpen(true);
  }

  function openDraft(m: AccountEmailRow) {
    setEditingDraft(m);
    setComposeOpen(true);
  }

  if (!mailboxConnected) {
    return (
      <>
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[var(--muted)] flex items-center justify-between gap-3">
          <div>
            <h5 className="font-bold text-slate-800 dark:text-slate-700 text-sm">Manage Emails</h5>
            <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-0.5">You can send and reply to emails directly via this section.</p>
          </div>
          <button onClick={() => setConnectOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex-shrink-0">
            Connect Account
          </button>
        </div>
        <ConnectAccountModal open={connectOpen} onClose={() => setConnectOpen(false)} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCompose} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
          <Send className="h-3.5 w-3.5" /> Compose Email
        </Button>
      </div>

      {emails.length === 0 ? (
        <Card className="p-6 text-center border-slate-100 dark:border-slate-800/80 shadow-none bg-slate-50/20 dark:bg-[var(--muted)]">
          <Mail className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2.5" />
          <h6 className="text-xs font-bold text-slate-800 dark:text-slate-700 mb-1">Interact with this account</h6>
          <p className="text-[11px] text-slate-500 dark:text-slate-500 max-w-sm mx-auto mb-3">
            Draft and send a real email, or reply to what you&apos;ve already sent.
          </p>
          <Button onClick={openCompose} className="text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4">
            Compose Email
          </Button>
        </Card>
      ) : (
        <ul className="space-y-2">
          {emails.map((m) => {
            const isDraft = m.direction === "draft";
            return (
              <li
                key={m.id}
                onClick={isDraft ? () => openDraft(m) : undefined}
                className={`p-3 rounded-lg border border-slate-100 dark:border-slate-800 flex items-start gap-2.5 ${isDraft ? "cursor-pointer hover:border-blue-300 dark:hover:border-blue-500/50" : ""}`}
              >
                <div className={
                  isDraft
                    ? "h-7 w-7 rounded-full bg-slate-400 flex items-center justify-center text-white flex-shrink-0"
                    : m.direction === "outbound"
                      ? "h-7 w-7 rounded-full bg-blue-500 flex items-center justify-center text-white flex-shrink-0"
                      : "h-7 w-7 rounded-full bg-emerald-500 flex items-center justify-center text-white flex-shrink-0"
                }>
                  {isDraft ? <FileEdit className="h-3.5 w-3.5" /> : m.direction === "outbound" ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-700 truncate">{m.subject || "(no subject)"}</p>
                  {m.body && <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-0.5 line-clamp-2">{m.body}</p>}
                  <p className="text-[10px] text-slate-400 mt-1">{isDraft ? "Draft — click to finish" : m.direction === "outbound" ? "Sent" : "Received"} · {formatDateTime(m.created_at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ComposeEmailModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        accountId={accountId}
        defaultTo={accountEmail}
        draft={editingDraft}
      />
    </div>
  );
}
