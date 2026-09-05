"use client";
import { useState, useEffect, useTransition } from "react";
import { ExternalLink, Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { disconnectHubspot, type HubspotAccountRow } from "@/lib/queries/hubspot-accounts";

function withNext(href: string, redirectTo: string | undefined): string {
  return redirectTo ? `${href}?next=${encodeURIComponent(redirectTo)}` : href;
}

export function HubspotConnection({
  account,
  configured,
  redirectTo,
}: {
  account: HubspotAccountRow | null;
  configured: boolean;
  redirectTo?: string;
}) {
  const [pending, start] = useTransition();
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from a URL param on mount
    if (p.get("connected") === "hubspot") setBanner({ kind: "ok", msg: "HubSpot connected — you can now push leads to your own HubSpot account." });
    const err = p.get("hubspot_error");
    if (err) setBanner({ kind: "err", msg: err });
  }, []);

  function remove(id: string) {
    start(async () => {
      const r = await disconnectHubspot(id);
      if (!r.ok) setBanner({ kind: "err", msg: r.error || "Couldn't disconnect" });
    });
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start gap-2">
        <ExternalLink className="h-5 w-5 text-orange-600 mt-0.5" />
        <div>
          <h3 className="font-semibold text-slate-900">HubSpot</h3>
          <p className="text-sm text-slate-500">Connect your own HubSpot account to push leads there as Contacts — one click from any lead, segment, or the Prospects list.</p>
        </div>
      </div>

      {banner && (
        <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${banner.kind === "ok" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
          {banner.kind === "ok" ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <AlertCircle className="h-4 w-4 mt-0.5" />}
          {banner.msg}
        </div>
      )}

      {!configured && (
        <p className="text-xs text-slate-400">HubSpot OAuth isn&apos;t configured yet. Add HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET to your environment to enable this.</p>
      )}

      {account ? (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 p-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <div>
              <p className="text-sm font-medium text-slate-800">{account.hub_domain || `Portal ${account.portal_id ?? ""}`}</p>
              <Badge variant="outline" className="mt-0.5">{account.status}</Badge>
            </div>
          </div>
          <button
            onClick={() => remove(account.id)}
            disabled={pending}
            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
            title="Disconnect"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <a href={withNext("/api/hubspot/connect", redirectTo)} aria-disabled={!configured} className={!configured ? "pointer-events-none opacity-50" : ""}>
          <Button variant="outline"><Plus className="h-4 w-4" /> Connect HubSpot</Button>
        </a>
      )}
    </Card>
  );
}
