"use client";
import { useState, useEffect, useTransition } from "react";
import { Calendar, Plus, Trash2, CheckCircle2, AlertCircle, RefreshCw, Link2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  disconnectCalendar,
  getCalendarBusy,
  type CalendarAccountRow,
} from "@/lib/queries/calendar-accounts";
import { disconnectZoom, type ZoomAccountRow } from "@/lib/queries/zoom-accounts";

const PROVIDER_LABEL: Record<string, string> = { google: "Google Calendar", microsoft: "Microsoft / Outlook" };

export function CalendarConnections({
  accounts,
  providerStatus,
  zoomAccounts,
  zoomConfigured,
  bookingSlug,
}: {
  accounts: CalendarAccountRow[];
  providerStatus: { google: boolean; microsoft: boolean };
  zoomAccounts: ZoomAccountRow[];
  zoomConfigured: boolean;
  bookingSlug?: string | null;
}) {
  const [pending, start] = useTransition();
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [availability, setAvailability] = useState<{ count: number; errors: string[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bookingUrl, setBookingUrl] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derives a display URL from a prop, needs window.location
    if (bookingSlug) setBookingUrl(`${window.location.origin}/book/${bookingSlug}`);
  }, [bookingSlug]);
  function copyBooking() {
    if (!bookingUrl) return;
    navigator.clipboard?.writeText(bookingUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  // Surface the OAuth redirect result (?connected=calendar|zoom / ?calendar_error=...).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const connected = p.get("connected");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from a URL param on mount
    if (connected === "calendar") setBanner({ kind: "ok", msg: "Calendar connected — availability will now sync." });
    if (connected === "zoom") setBanner({ kind: "ok", msg: "Zoom connected — meetings will get a real, shared join link." });
    const err = p.get("calendar_error");
    if (err) setBanner({ kind: "err", msg: err });
  }, []);

  function remove(id: string) {
    start(async () => {
      const r = await disconnectCalendar(id);
      if (!r.ok) setBanner({ kind: "err", msg: r.error || "Couldn't disconnect" });
    });
  }

  function removeZoom(id: string) {
    start(async () => {
      const r = await disconnectZoom(id);
      if (!r.ok) setBanner({ kind: "err", msg: r.error || "Couldn't disconnect" });
    });
  }

  async function checkAvailability() {
    setChecking(true);
    setAvailability(null);
    const now = new Date();
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    try {
      const { busy, errors } = await getCalendarBusy(now.toISOString(), end.toISOString());
      setAvailability({ count: busy.length, errors });
    } catch (e) {
      setBanner({ kind: "err", msg: e instanceof Error ? e.message : "Availability check failed" });
    } finally {
      setChecking(false);
    }
  }

  const anyConfigured = providerStatus.google || providerStatus.microsoft || zoomConfigured;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Calendar className="h-5 w-5 text-slate-700 mt-0.5" />
        <div>
          <h3 className="font-semibold text-slate-900">Calendar</h3>
          <p className="text-sm text-slate-500">Connect your calendar so your availability syncs automatically, and Google Meet / Zoom links are created for real, shared meeting rooms instead of a generic fallback.</p>
        </div>
      </div>

      {banner && (
        <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${banner.kind === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {banner.kind === "ok" ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
          <span>{banner.msg}</span>
        </div>
      )}

      {/* Connect buttons */}
      <div className="flex flex-wrap gap-3">
        <a href="/api/calendar/google/connect" aria-disabled={!providerStatus.google} className={!providerStatus.google ? "pointer-events-none opacity-50" : ""}>
          <Button variant="outline"><Plus className="h-4 w-4" /> Connect Google Calendar</Button>
        </a>
        <a href="/api/calendar/microsoft/connect" aria-disabled={!providerStatus.microsoft} className={!providerStatus.microsoft ? "pointer-events-none opacity-50" : ""}>
          <Button variant="outline"><Plus className="h-4 w-4" /> Connect Outlook Calendar</Button>
        </a>
        <a href="/api/zoom/connect" aria-disabled={!zoomConfigured} className={!zoomConfigured ? "pointer-events-none opacity-50" : ""}>
          <Button variant="outline"><Plus className="h-4 w-4" /> Connect Zoom</Button>
        </a>
      </div>

      {!anyConfigured && (
        <p className="text-xs text-slate-400">
          Calendar OAuth isn&apos;t configured yet. Add the Google / Microsoft / Zoom client credentials to your environment to enable these buttons.
        </p>
      )}

      {/* Connected accounts */}
      {accounts.length > 0 && (
        <div className="space-y-2">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-slate-800">{PROVIDER_LABEL[a.provider] || a.provider}</p>
                  <p className="text-xs text-slate-500">{a.email || "Connected"}</p>
                </div>
                <Badge variant="success">{a.status}</Badge>
              </div>
              <button
                onClick={() => remove(a.id)}
                disabled={pending}
                title="Disconnect"
                className="p-1.5 rounded-md hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" />
              </button>
            </div>
          ))}

          {/* Availability sync preview — proves the free/busy read works (LP-3) */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button variant="outline" size="sm" onClick={checkAvailability} disabled={checking}>
              <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} /> {checking ? "Syncing…" : "Sync availability now"}
            </Button>
            {availability && (
              <span className="text-sm text-slate-600">
                {availability.count} busy {availability.count === 1 ? "slot" : "slots"} in the next 7 days.
                {availability.errors.length > 0 && <span className="text-red-600"> ({availability.errors.join("; ")})</span>}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Connected Zoom accounts — no availability sync, just meeting creation */}
      {zoomAccounts.length > 0 && (
        <div className="space-y-2">
          {zoomAccounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-slate-800">Zoom</p>
                  <p className="text-xs text-slate-500">{a.email || "Connected"}</p>
                </div>
                <Badge variant="success">{a.status}</Badge>
              </div>
              <button
                onClick={() => removeZoom(a.id)}
                disabled={pending}
                title="Disconnect"
                className="p-1.5 rounded-md hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* LP-20 — public booking link */}
      {bookingSlug && (
        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><Link2 className="h-4 w-4 text-slate-400" /> Your booking link</p>
          <p className="text-xs text-slate-500 mb-2">Share this so leads can pick an open time on your calendar and self-schedule.</p>
          <div className="flex gap-2">
            <input readOnly value={bookingUrl} className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600" />
            <Button variant="outline" onClick={copyBooking} className="flex-shrink-0">
              {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
            </Button>
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer"><Button variant="outline">Open</Button></a>
          </div>
        </div>
      )}
    </div>
  );
}
