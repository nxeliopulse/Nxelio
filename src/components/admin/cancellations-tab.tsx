"use client";

import { useState, useTransition } from "react";
import {
  ChevronDown, ChevronUp, Loader2, AlertTriangle, Video, CalendarCheck,
  UserCheck, XCircle, Clock, PhoneOff, HelpCircle, RotateCcw,
} from "lucide-react";
import {
  updateCancellationTicket,
  createMeetingForTicket,
  adminCancelSubscription,
} from "@/lib/queries/cancellation-requests";
import type { CancellationRequest, CancellationStatus } from "@/lib/queries/cancellation-types";
import { REASON_LABELS } from "@/lib/queries/cancellation-types";

// "pending" is labeled differently depending on audience: the customer's own
// confirmation screen/email says "cancellation request received" (unchanged),
// while here in the admin panel it reads as an action the admin still owes —
// "Waiting for Approval" — same underlying status, no DB/customer-facing change.
const STATUS_LABELS: Record<CancellationStatus, string> = {
  pending: "Waiting for Approval",
  meeting_scheduled: "Meeting Scheduled",
  retained: "Retained",
  cancelled: "Cancelled",
  follow_up_required: "Follow-up Required",
  no_response: "No Response",
  reactivated: "Active",
};

const STATUS_STYLE: Record<CancellationStatus, string> = {
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  meeting_scheduled: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  retained: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  cancelled: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  follow_up_required: "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
  no_response: "bg-slate-100 text-slate-600",
  reactivated: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
};

const STATUS_ICON: Record<CancellationStatus, React.ElementType> = {
  pending: Clock,
  meeting_scheduled: CalendarCheck,
  retained: UserCheck,
  cancelled: XCircle,
  follow_up_required: HelpCircle,
  no_response: PhoneOff,
  reactivated: RotateCcw,
};

// The full set shown for tickets not (yet) cancelled — "reactivated" only
// makes sense once a ticket has actually been cancelled, so it's excluded
// here and added back in only for cancelled tickets (see selectableStatuses).
const ALL_STATUSES: CancellationStatus[] = [
  "pending", "meeting_scheduled", "retained", "cancelled", "follow_up_required", "no_response",
];

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

interface TicketRowProps {
  ticket: CancellationRequest;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
}

function TicketRow({ ticket, onUpdate }: TicketRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [meetingPending, startMeetingTransition] = useTransition();
  const [cancelPending, startCancelTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState(ticket.admin_notes ?? "");
  const [retentionOffer, setRetentionOffer] = useState(ticket.retention_offer ?? "");
  const [meetingLink, setMeetingLink] = useState(ticket.meeting_link ?? "");
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const StatusIcon = STATUS_ICON[ticket.status];

  function saveField(field: "admin_notes" | "retention_offer" | "meeting_link", value: string) {
    startTransition(async () => {
      const res = await updateCancellationTicket(ticket.id, { [field]: value });
      if (!res.ok) setError(res.error ?? "Save failed");
      else onUpdate(ticket.id, { [field]: value });
    });
  }

  function changeStatus(status: CancellationStatus) {
    startTransition(async () => {
      setError(null);
      const patch: Partial<CancellationRequest> = { status };
      // "reactivated" re-stamps resolved_at to the reactivation date — the
      // date shown should reflect the most recent thing that happened, not
      // the original cancellation.
      if (["retained", "cancelled", "no_response", "reactivated"].includes(status)) {
        patch.resolved_at = new Date().toISOString();
      }
      const res = await updateCancellationTicket(ticket.id, patch);
      if (!res.ok) setError(res.error ?? "Update failed");
      else onUpdate(ticket.id, patch);
    });
  }

  // Once cancelled, the only forward move is reactivating — every other
  // status would be a confusing step "backwards" through an already-closed
  // flow. Reactivation itself only makes sense from a cancelled ticket.
  const selectableStatuses: CancellationStatus[] =
    ticket.status === "cancelled" ? ["cancelled", "reactivated"] : ALL_STATUSES;

  function handleCreateMeeting() {
    startMeetingTransition(async () => {
      setError(null);
      const res = await createMeetingForTicket(ticket.id);
      if (!res.ok) { setError(res.error ?? "Failed to create meeting"); return; }
      setMeetingLink(res.joinUrl ?? "");
      onUpdate(ticket.id, { meeting_link: res.joinUrl, status: "meeting_scheduled", meeting_scheduled_at: new Date().toISOString() });
    });
  }

  function handleCancelSubscription() {
    startCancelTransition(async () => {
      setError(null);
      const res = await adminCancelSubscription(ticket.workspace_id, ticket.id);
      if (!res.ok) { setError(res.error ?? "Failed to cancel subscription"); return; }
      onUpdate(ticket.id, { status: "cancelled", resolved_at: new Date().toISOString() });
      setCancelConfirm(false);
    });
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Summary row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-900">{ticket.customer_email}</span>
            {ticket.plan_id && <span className="text-xs text-slate-500 capitalize">{ticket.plan_id}</span>}
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[ticket.status]}`}>
              <StatusIcon className="h-3 w-3" />
              {STATUS_LABELS[ticket.status]}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-slate-500">{REASON_LABELS[ticket.reason]}</span>
            {ticket.wants_meeting && (
              <span className="text-xs text-blue-600 flex items-center gap-1">
                <Video className="h-3 w-3" />
                Meeting requested — {ticket.meeting_provider === "zoom" ? "Zoom" : "Google Meet"}
              </span>
            )}
            <span className="text-xs text-slate-400">{fmt(ticket.created_at)}</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-slate-200 p-4 space-y-4 bg-slate-50">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Customer details */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Customer" value={ticket.customer_name ?? "—"} />
            <Field label="Email" value={ticket.customer_email} />
            <Field label="Plan" value={ticket.plan_id ?? "—"} />
            <Field label="Reason" value={REASON_LABELS[ticket.reason]} />
            <Field label="Submitted" value={fmt(ticket.created_at)} />
            {ticket.resolved_at && (
              <Field
                label={ticket.status === "cancelled" ? "Cancelled on" : ticket.status === "reactivated" ? "Reactivated on" : "Resolved"}
                value={fmt(ticket.resolved_at)}
              />
            )}
          </div>

          {ticket.feedback && (
            <div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Customer Feedback</span>
              <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{ticket.feedback}</p>
            </div>
          )}

          {/* Meeting details */}
          {ticket.wants_meeting && (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 space-y-2">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Meeting Request</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-slate-500">Platform</span>
                <span className="text-slate-800 dark:text-slate-200 capitalize">{ticket.meeting_provider?.replace("_", " ")}</span>
                <span className="text-slate-500">Preferred date</span>
                <span className="text-slate-800 dark:text-slate-200">{ticket.preferred_date ?? "—"}</span>
                <span className="text-slate-500">Preferred time (UTC)</span>
                <span className="text-slate-800 dark:text-slate-200">{ticket.preferred_time ?? "—"}</span>
              </div>
              {!ticket.meeting_link && (
                <button
                  onClick={handleCreateMeeting}
                  disabled={meetingPending}
                  className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-blue-700 bg-white border border-blue-300 dark:border-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50"
                >
                  {meetingPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
                  Create Meeting Link
                </button>
              )}
              {(meetingLink || ticket.meeting_link) && (
                <div>
                  <label className="text-xs font-medium text-blue-700 dark:text-blue-400 block mb-1">Meeting link</label>
                  <input
                    type="url"
                    value={meetingLink}
                    onChange={e => setMeetingLink(e.target.value)}
                    onBlur={e => saveField("meeting_link", e.target.value)}
                    className="w-full text-xs rounded-lg border border-blue-200 dark:border-blue-600 px-3 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          {/* Status */}
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">Status</label>
            <select
              value={ticket.status}
              onChange={e => changeStatus(e.target.value as CancellationStatus)}
              disabled={pending}
              className="text-sm rounded-lg border border-slate-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 text-slate-800"
            >
              {selectableStatuses.map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Admin notes */}
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">Admin Notes</label>
            <textarea
              rows={2}
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              onBlur={e => saveField("admin_notes", e.target.value)}
              placeholder="Internal notes…"
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>

          {/* Retention offer */}
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">Retention Offer</label>
            <textarea
              rows={2}
              value={retentionOffer}
              onChange={e => setRetentionOffer(e.target.value)}
              onBlur={e => saveField("retention_offer", e.target.value)}
              placeholder="e.g. 2 months free, 30% discount…"
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>

          {/* Cancel subscription */}
          {ticket.status !== "cancelled" && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              {!cancelConfirm ? (
                <button
                  onClick={() => setCancelConfirm(true)}
                  className="text-sm font-medium text-red-600 hover:text-red-700 flex items-center gap-1.5"
                >
                  <XCircle className="h-4 w-4" /> Cancel subscription in Stripe
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                    This will set cancel_at_period_end = true in Stripe. Continue?
                  </p>
                  <button
                    onClick={handleCancelSubscription}
                    disabled={cancelPending}
                    className="text-sm font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {cancelPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Confirm cancel
                  </button>
                  <button onClick={() => setCancelConfirm(false)} className="text-sm text-slate-500 hover:text-slate-700">
                    No, go back
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-slate-500 block">{label}</span>
      <span className="text-sm font-medium text-slate-800">{value}</span>
    </div>
  );
}

interface CancellationsTabProps {
  initialRequests: CancellationRequest[];
}

export function CancellationsTab({ initialRequests }: CancellationsTabProps) {
  const [requests, setRequests] = useState(initialRequests);

  function updateTicket(id: string, patch: Record<string, unknown>) {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } as CancellationRequest : r));
  }

  // Analytics from current state
  const total = requests.length;
  const byStatus = (s: CancellationStatus) => requests.filter(r => r.status === s).length;
  const reasonCounts = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.reason] = (acc[r.reason] ?? 0) + 1;
    return acc;
  }, {});
  const topReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxCount = topReasons[0]?.[1] ?? 1;

  const statCards = [
    { label: "Total", value: total, color: "text-slate-700", bg: "bg-slate-50" },
    { label: "Waiting for Approval", value: byStatus("pending"), color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20" },
    { label: "Meeting Scheduled", value: byStatus("meeting_scheduled"), color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20" },
    { label: "Retained", value: byStatus("retained"), color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
    { label: "Cancelled", value: byStatus("cancelled"), color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20" },
    { label: "Active (Reactivated)", value: byStatus("reactivated"), color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
    { label: "Follow-up Required", value: byStatus("follow_up_required"), color: "text-purple-700 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/20" },
  ];

  return (
    <div className="space-y-6">
      {/* Analytics */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Overview</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {statCards.map(c => (
            <div key={c.label} className={`rounded-xl p-4 ${c.bg}`}>
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Top reasons */}
      {topReasons.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Top Cancellation Reasons</h3>
          <div className="space-y-2">
            {topReasons.map(([reason, count]) => (
              <div key={reason} className="flex items-center gap-3">
                <span className="text-xs text-slate-600 w-40 shrink-0 truncate">
                  {REASON_LABELS[reason as keyof typeof REASON_LABELS] ?? reason}
                </span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-slate-600 w-5 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tickets list */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
          Cancellation Requests {total > 0 && `(${total})`}
        </h3>
        {requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-12 text-center">
            <XCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No cancellation requests yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(r => (
              <TicketRow key={r.id} ticket={r} onUpdate={updateTicket} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
