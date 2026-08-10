"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2, CheckCircle2, AlertCircle, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import {
  connectWhatsAppAccount,
  checkWhatsAppConnection,
  deleteOutreachAccount,
  type OutreachAccountRow,
} from "@/lib/queries/outreach-accounts";

/**
 * Connects the workspace's ONE shared WhatsApp number (same one-account cap
 * as email/LinkedIn) via Unipile's native QR/pairing-code flow — there's no
 * hosted-auth-link redirect for WhatsApp. "Change number" is just disconnect
 * + reconnect: deleteOutreachAccount() already tells Unipile to drop the old
 * number, then connect() below starts a fresh pairing for the new one.
 */
export function WhatsAppConnections({
  accounts,
  connectorReady,
}: {
  accounts: OutreachAccountRow[];
  connectorReady: boolean;
}) {
  const { confirm } = useFeedback();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [checkpoint, setCheckpoint] = useState<{ accountId: string; qrCode?: string; pairingCode?: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function pollUntilConnected(accountId: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const { status } = await checkWhatsAppConnection(accountId);
      if (status === "connected") {
        stopPolling();
        setCheckpoint(null);
        router.refresh();
      }
    }, 4000);
  }

  async function connect() {
    setError(null);
    setConnecting(true);
    try {
      const res = await connectWhatsAppAccount(phone.trim() || undefined);
      if (res.ok) {
        setCheckpoint({ accountId: res.accountId, qrCode: res.qrCode, pairingCode: res.pairingCode });
        pollUntilConnected(res.accountId);
      } else {
        setError(res.error);
      }
    } finally {
      setConnecting(false);
    }
  }

  function disconnect(id: string, label: string) {
    start(async () => {
      const ok = await confirm({
        title: "Disconnect WhatsApp?",
        message: `Disconnect ${label}? Campaigns will stop using it for WhatsApp messages and reply capture. You can connect a different number right after.`,
        confirmLabel: "Disconnect",
        danger: true,
      });
      if (!ok) return;
      try {
        stopPolling();
        setCheckpoint(null);
        await deleteOutreachAccount(id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't disconnect");
      }
    });
  }

  const connectedAccount = accounts.find((a) => a.status === "connected");
  const connectingAccount = accounts.find((a) => a.status !== "connected");

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
        </div>
      )}

      {connectedAccount && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><MessageCircle className="h-4.5 w-4.5" /></div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-slate-900">{connectedAccount.identifier || connectedAccount.name || "WhatsApp number"}</p>
                <Badge variant="success"><CheckCircle2 className="h-2.5 w-2.5" /> Connected</Badge>
              </div>
              <p className="text-xs text-slate-500">WhatsApp</p>
            </div>
          </div>
          <button
            onClick={() => disconnect(connectedAccount.id, connectedAccount.identifier || connectedAccount.name || "this number")}
            disabled={pending}
            title="Disconnect / change number"
            className="p-1.5 rounded-md hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" />
          </button>
        </div>
      )}

      {connectingAccount && !connectedAccount && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 text-amber-600 animate-spin" />
            <div>
              <p className="font-semibold text-slate-900">Waiting for confirmation on WhatsApp&hellip;</p>
              <p className="text-xs text-slate-500">Scan the QR code or enter the pairing code shown below in WhatsApp &gt; Linked Devices.</p>
            </div>
          </div>
          <button
            onClick={() => disconnect(connectingAccount.id, "this connection attempt")}
            disabled={pending}
            title="Cancel"
            className="p-1.5 rounded-md hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" />
          </button>
        </div>
      )}

      {checkpoint && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          {checkpoint.qrCode && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm text-slate-600">Scan this QR code with WhatsApp &gt; Linked Devices &gt; Link a Device</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- Unipile returns this as a data:/base64 QR image, not a static asset */}
              <img src={checkpoint.qrCode.startsWith("data:") ? checkpoint.qrCode : `data:image/png;base64,${checkpoint.qrCode}`} alt="WhatsApp QR code" className="h-48 w-48 rounded-lg border border-slate-200 bg-white" />
            </div>
          )}
          {checkpoint.pairingCode && (
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-1">Enter this code in WhatsApp &gt; Linked Devices &gt; Link with phone number</p>
              <p className="text-2xl font-bold tracking-widest text-slate-900">{checkpoint.pairingCode}</p>
            </div>
          )}
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <RefreshCw className="h-3 w-3 animate-spin" /> Checking connection status&hellip;
          </div>
        </div>
      )}

      {accounts.length === 0 && !checkpoint && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">
            Connect one shared WhatsApp Business number for the whole workspace — the same number every campaign sends from.
          </p>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Phone number, e.g. +15551234567 (optional — leave blank to scan a QR code instead)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={connecting}
            />
            <Button variant="outline" onClick={connect} disabled={connecting || !connectorReady}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Connect
            </Button>
          </div>
        </div>
      )}
      {!connectorReady && (
        <p className="text-xs text-slate-400">WhatsApp connection isn&apos;t available yet — contact support to enable it.</p>
      )}
    </div>
  );
}
