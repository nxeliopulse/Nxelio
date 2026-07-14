"use client";
import { ScrollText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { AuditLogRow } from "@/lib/queries/audit-log";

const ACTION_LABEL: Record<string, string> = {
  "lead.created": "Created lead", "lead.updated": "Updated lead", "lead.deleted": "Deleted lead",
  "lead.bulk_deleted": "Bulk-deleted leads", "leads.imported": "Imported leads", "leads.bought": "Bought leads",
  "lead.emailed": "Emailed lead",
  "campaign.created": "Created campaign", "campaign.updated": "Updated campaign", "campaign.deleted": "Deleted campaign",
  "campaign.duplicated": "Duplicated campaign", "campaign.sent": "Sent campaign",
  "segment.created": "Created segment", "segment.updated": "Updated segment", "segment.deleted": "Deleted segment",
  "template.created": "Created template", "template.updated": "Updated template", "template.deleted": "Deleted template",
  "newsletter.created": "Created newsletter", "newsletter.updated": "Updated newsletter", "newsletter.deleted": "Deleted newsletter",
  "newsletter.duplicated": "Duplicated newsletter", "newsletter.sent": "Sent newsletter",
  "connector.connected": "Connected an account", "connector.disconnected": "Disconnected an account",
  "calendar.connected": "Connected calendar", "calendar.disconnected": "Disconnected calendar",
  "user.status_updated": "Updated user status", "user.role_updated": "Updated user role",
  "user.permission_updated": "Updated user permission", "user.invited": "Invited user",
  "user.deleted": "Removed user", "user.nav_access_updated": "Updated user nav access",
  "user.password_reset": "Reset user password",
  "meeting.created": "Created meeting", "meeting.updated": "Updated meeting",
  "meeting.scheduled": "Scheduled meeting", "meeting.deleted": "Deleted meeting",
  "opportunity.created": "Created opportunity", "opportunity.stage_moved": "Moved opportunity stage",
  "opportunity.updated": "Updated opportunity", "opportunity.deleted": "Deleted opportunity",
  "workflow.created": "Created workflow", "workflow.updated": "Updated workflow", "workflow.deleted": "Deleted workflow",
};

function actionLabel(action: string): string {
  return ACTION_LABEL[action] || action;
}

function actionBadge(action: string): "danger" | "success" | "blue" | "default" {
  if (action.includes("deleted")) return "danger";
  if (action.includes("created") || action.includes("sent") || action.includes("bought") || action.includes("imported") || action.includes("invited") || action.includes("connected")) return "success";
  return "blue";
}

export function AuditLogView({ entries }: { entries: AuditLogRow[] }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><ScrollText className="h-4 w-4 text-blue-600" /> Audit log</h3>
          <p className="text-sm text-slate-500 mt-0.5">Every create/update/delete across the workspace — who did what, and when. Visible to Super Admins only; entries can&apos;t be edited or deleted, even here.</p>
        </div>
        <span className="text-xs text-slate-400">Last {entries.length} entries</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-10">No activity recorded yet.</p>
      ) : (
        <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-100">
          {entries.map((e) => (
            <div key={e.id} className="flex items-start gap-3 px-5 py-3">
              <Badge variant={actionBadge(e.action)} className="mt-0.5 flex-shrink-0">{actionLabel(e.action)}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-900">
                  <span className="font-medium">{e.actor_name || "Unknown"}</span>
                  {e.entity_label && <> &middot; <span className="text-slate-600">{e.entity_label}</span></>}
                </p>
                {e.metadata && Object.keys(e.metadata).length > 0 && (
                  <p className="text-xs text-slate-400 mt-0.5 truncate" title={JSON.stringify(e.metadata)}>
                    {Object.entries(e.metadata).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}
                  </p>
                )}
              </div>
              <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">{formatDate(e.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
