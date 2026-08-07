"use client";
import { useState } from "react";
import { ExternalLink, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { connectOutreachAccount } from "@/lib/queries/outreach-accounts";

/** Real mailbox connection — reuses the exact same Unipile flow as Settings >
 *  Email (connectOutreachAccount). No "Account Type" or "Sync range" picker:
 *  Unipile's hosted auth link doesn't support pre-selecting a provider or a
 *  sync-from date, so those fields would just be decorative — left out rather
 *  than shown non-functional. Clicking Connect opens Google/Outlook sign-in
 *  in a new tab; requires a Super Admin (same restriction as Settings). */
export function ConnectAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function connect() {
    setError(null);
    setConnecting(true);
    // Open the tab synchronously, in direct response to the click — most
    // browsers block window.open() called after an await, since by then it's
    // no longer considered a direct result of user interaction. We navigate
    // this already-open tab to the real URL once the request resolves.
    // IMPORTANT: no "noopener" here — that flag makes window.open() always
    // return null (by spec), which silently defeated this whole workaround
    // (the blank tab opened but nothing ever told it where to go).
    const tab = window.open("", "_blank");
    try {
      const res = await connectOutreachAccount("email", "/settings?section=email");
      if (res.ok && res.url) {
        if (tab) tab.location.href = res.url;
        else window.open(res.url, "_blank", "noopener"); // popup was blocked even for the blank tab — try once more with the real URL
        onClose();
      } else {
        tab?.close();
        setError(res.error || "Couldn't start the connection.");
      }
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Couldn't start the connection.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/45 backdrop-blur-xs z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-bold text-base text-slate-900 dark:text-white">Connect Account</h2>
            <button onClick={onClose} className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-full p-1.5">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            {error && <p className="text-xs font-bold text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-400 p-2 rounded-lg">{error}</p>}
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                <Mail className="h-4.5 w-4.5" />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Clicking Connect opens Google or Outlook sign-in in a new tab. Once you sign in and approve access, your mailbox is connected workspace-wide for sending real email — the same connection used in Settings → Email.
              </p>
            </div>
            <p className="text-[11px] text-slate-400">Requires a Super Admin account, since this connects a mailbox for the whole workspace.</p>
          </div>
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={connecting}>Cancel</Button>
            <Button onClick={connect} disabled={connecting} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
              {connecting ? "Opening…" : <>Connect Account <ExternalLink className="h-3.5 w-3.5" /></>}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
