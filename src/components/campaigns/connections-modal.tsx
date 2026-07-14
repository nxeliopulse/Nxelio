"use client";
import { useEffect, useState } from "react";
import { Share2, Mail, ExternalLink, RefreshCw, Loader2, CheckCircle2, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  getOutreachAccounts, connectOutreachAccount, syncOutreachAccounts, deleteOutreachAccount,
  isUnipileConfigured, type OutreachAccountRow,
} from "@/lib/queries/outreach-accounts";

export function ConnectionsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [accounts, setAccounts] = useState<OutreachAccountRow[]>([]);
  const [unipileReady, setUnipileReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([isUnipileConfigured(), getOutreachAccounts()])
      .then(([ready, accs]) => { setUnipileReady(ready); setAccounts(accs); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch + populate on modal open
    if (open) load();
  }, [open]);

  function connect(channel: "linkedin" | "email") {
    setBusy(channel);
    connectOutreachAccount(channel)
      .then((res) => { if (res.ok && res.url) window.open(res.url, "_blank", "noopener"); })
      .finally(() => setBusy(null));
  }
  function recheck() {
    setBusy("recheck");
    syncOutreachAccounts().then(load).finally(() => setBusy(null));
  }
  function disconnect(id: string) {
    setBusy(id);
    deleteOutreachAccount(id).then(load).finally(() => setBusy(null));
  }

  const linkedin = accounts.filter((a) => a.channel === "linkedin");
  const email = accounts.filter((a) => a.channel === "email");

  return (
    <Modal open={open} onClose={onClose} title="Connections" description="Connect the accounts campaigns send from" size="md">
      <div className="p-5 space-y-3">
        {unipileReady === false && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
            LinkedIn connections require Unipile — add <code className="text-xs">UNIPILE_DSN</code> and <code className="text-xs">UNIPILE_API_KEY</code>.
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            <ConnectionRow channel="linkedin" label="LinkedIn" hint="Pull leads from search & posts, send invites/messages" accts={linkedin} busy={busy} onConnect={connect} onDisconnect={disconnect} />
            <ConnectionRow channel="email" label="Email mailbox (optional)" hint="Send from your own inbox instead of the default sender" accts={email} busy={busy} onConnect={connect} onDisconnect={disconnect} />
            <p className="text-[11px] text-slate-400">After authorizing in the new tab, come back and click Recheck.</p>
          </>
        )}
      </div>
      <div className="p-4 border-t border-slate-100 flex justify-between">
        <Button variant="outline" onClick={recheck} disabled={busy === "recheck"}>
          {busy === "recheck" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Recheck
        </Button>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

function ConnectionRow({
  channel, label, hint, accts, busy, onConnect, onDisconnect,
}: {
  channel: "linkedin" | "email"; label: string; hint: string; accts: OutreachAccountRow[];
  busy: string | null; onConnect: (channel: "linkedin" | "email") => void; onDisconnect: (id: string) => void;
}) {
  const Icon = channel === "linkedin" ? Share2 : Mail;
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${channel === "linkedin" ? "bg-sky-50 text-sky-600" : "bg-blue-50 text-blue-600"}`}>
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="font-medium text-slate-900 text-sm">{label}</p>
            <p className="text-xs text-slate-500">{hint}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onConnect(channel)} disabled={busy === channel}>
          {busy === channel ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Connect
        </Button>
      </div>
      {accts.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
          {accts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 min-w-0 text-slate-700">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                <span className="truncate">{a.name || a.identifier || a.account_id}</span>
              </span>
              <button onClick={() => onDisconnect(a.id)} disabled={busy === a.id} aria-label="Disconnect" className="p-1 rounded text-slate-300 hover:text-red-600 hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
