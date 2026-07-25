"use client";
import { Mail, ShieldAlert, CheckCircle2, AlertCircle } from "lucide-react";
import { Linkedin } from "@/components/outreach/linkedin-icon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MailboxConnections } from "@/components/settings/mailbox-connections";
import { LinkedInConnections } from "@/components/settings/linkedin-connections";
import { CalendarConnections } from "@/components/settings/calendar-connections";
import type { OutreachAccountRow } from "@/lib/queries/outreach-accounts";
import type { CalendarAccountRow } from "@/lib/queries/calendar-accounts";

/**
 * Split into three separate connector panels (Email / LinkedIn / Calendar) —
 * each its own Settings tab instead of one combined "Connectors" page.
 * Deliberately never names the backend vendor (Brevo/Unipile) to the user;
 * only the real end-service names (Gmail/Outlook/LinkedIn) are shown.
 */

function AdminOnlyNotice({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  if (isSuperAdmin) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <ShieldAlert className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <span>Only a Super Admin can connect or disconnect accounts. You can view what&apos;s connected below.</span>
    </div>
  );
}

export function EmailConnectorView({
  isSuperAdmin,
  emailSendingActive,
  mailboxAccounts,
  connectorReady,
}: {
  isSuperAdmin: boolean;
  /** Whether outbound email is actually reaching real recipients (vs. simulated) — never names the backend vendor. */
  emailSendingActive: boolean;
  mailboxAccounts: OutreachAccountRow[];
  connectorReady: boolean;
}) {
  return (
    <div className="space-y-4">
      <AdminOnlyNotice isSuperAdmin={isSuperAdmin} />
      <Card className="p-6">
        <div className="flex items-start gap-2 mb-4">
          <Mail className="h-5 w-5 text-slate-700 mt-0.5" />
          <div>
            <h4 className="font-semibold text-slate-900">Email</h4>
            <p className="text-sm text-slate-500">Link Gmail or Outlook to send campaigns from your own inbox and capture replies. One account at a time.</p>
          </div>
        </div>

        <div className={`mb-4 flex items-start gap-2 rounded-lg p-3 text-sm border ${emailSendingActive ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
          {emailSendingActive ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
          <div>
            <p className="font-semibold">{emailSendingActive ? "Email sending is active" : "Email sending isn't set up yet"}</p>
            <p className="text-xs mt-1">
              {emailSendingActive
                ? "Campaign and newsletter emails are reaching real recipients."
                : "Emails are currently simulated (logged, not delivered) until sending is configured."}
            </p>
          </div>
          <Badge variant={emailSendingActive ? "success" : "warning"} className="ml-auto">{emailSendingActive ? "Active" : "Not set up"}</Badge>
        </div>

        <fieldset disabled={!isSuperAdmin} className={!isSuperAdmin ? "opacity-60 pointer-events-none" : ""}>
          <MailboxConnections accounts={mailboxAccounts} unipileConfigured={connectorReady} />
        </fieldset>
      </Card>
    </div>
  );
}

export function LinkedInConnectorView({
  isSuperAdmin,
  linkedinAccounts,
  connectorReady,
}: {
  isSuperAdmin: boolean;
  linkedinAccounts: OutreachAccountRow[];
  connectorReady: boolean;
}) {
  return (
    <div className="space-y-4">
      <AdminOnlyNotice isSuperAdmin={isSuperAdmin} />
      <Card className="p-6">
        <div className="flex items-start gap-2 mb-4">
          <Linkedin className="h-5 w-5 text-slate-700 mt-0.5" />
          <div>
            <h4 className="font-semibold text-slate-900">LinkedIn</h4>
            <p className="text-sm text-slate-500">Connect LinkedIn to send outreach and capture replies. One account at a time.</p>
          </div>
        </div>
        <fieldset disabled={!isSuperAdmin} className={!isSuperAdmin ? "opacity-60 pointer-events-none" : ""}>
          <LinkedInConnections accounts={linkedinAccounts} connectorReady={connectorReady} />
        </fieldset>
      </Card>
    </div>
  );
}

export function CalendarConnectorView({
  isSuperAdmin,
  calendarAccounts,
  calendarProviderStatus,
  bookingSlug,
}: {
  isSuperAdmin: boolean;
  calendarAccounts: CalendarAccountRow[];
  calendarProviderStatus: { google: boolean; microsoft: boolean };
  bookingSlug?: string | null;
}) {
  return (
    <div className="space-y-4">
      <AdminOnlyNotice isSuperAdmin={isSuperAdmin} />
      <Card className="p-6">
        <fieldset disabled={!isSuperAdmin} className={!isSuperAdmin ? "opacity-60 pointer-events-none" : ""}>
          <CalendarConnections accounts={calendarAccounts} providerStatus={calendarProviderStatus} bookingSlug={bookingSlug} />
        </fieldset>
      </Card>
    </div>
  );
}
