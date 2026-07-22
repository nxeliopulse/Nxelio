"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2, CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { Linkedin } from "@/components/outreach/linkedin-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import { connectOutreachAccount, deleteOutreachAccount, type OutreachAccountRow } from "@/lib/queries/outreach-accounts";

/** Connect, disconnect, or switch the linked LinkedIn account from Settings. Capped at one account. */
export function LinkedInConnections({
  accounts,
  connectorReady,
}: {
  accounts: OutreachAccountRow[];
  connectorReady: boolean;
}) {
  const { confirm } = useFeedback();
  const [pending, start] = useTransition();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    setConnecting(true);
    try {
      const res = await connectOutreachAccount("linkedin", "/settings?section=connectors");
      if (res.ok && res.url) {
        window.open(res.url, "_blank", "noopener");
      } else {
        setError(res.error || "Couldn't start the connection.");
      }
    } finally {
      setConnecting(false);
    }
  }

  function disconnect(id: string, label: string) {
    start(async () => {
      const ok = await confirm({
        title: "Disconnect LinkedIn?",
        message: `Disconnect ${label}? Campaigns will stop using it for LinkedIn outreach and reply capture.`,
        confirmLabel: "Disconnect",
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteOutreachAccount(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't disconnect");
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="text-sm text-slate-500">No LinkedIn account connected yet. Connect one to send LinkedIn outreach and capture replies.</p>
      ) : (
        accounts.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center"><Linkedin className="h-4.5 w-4.5" /></div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900">{a.identifier || a.name || "LinkedIn account"}</p>
                  {a.status === "connected"
                    ? <Badge variant="success"><CheckCircle2 className="h-2.5 w-2.5" /> Connected</Badge>
                    : <Badge variant="warning">{a.status}</Badge>}
                </div>
                <p className="text-xs text-slate-500">LinkedIn</p>
              </div>
            </div>
            <button
              onClick={() => disconnect(a.id, a.identifier || a.name || "this account")}
              disabled={pending}
              title="Disconnect"
              className="p-1.5 rounded-md hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" />
            </button>
          </div>
        ))
      )}

      {accounts.length === 0 && (
        <Button variant="outline" className="w-full" onClick={connect} disabled={connecting || !connectorReady}>
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Connect LinkedIn
          {!connecting && <ExternalLink className="h-3.5 w-3.5 opacity-60" />}
        </Button>
      )}
      {!connectorReady && (
        <p className="text-xs text-slate-400">LinkedIn connection isn&apos;t available yet — contact support to enable it.</p>
      )}
    </div>
  );
}
