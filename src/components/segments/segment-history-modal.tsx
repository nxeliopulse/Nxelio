"use client";

import { useState, useEffect } from "react";
import { History } from "lucide-react";
import { getEntityAuditLog, type AuditLogRow } from "@/lib/queries/audit-log";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { formatRelative, cn } from "@/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  "segment.created": "Created segment",
  "segment.updated": "Updated segment",
  "segment.deleted": "Deleted segment",
  "segment.archived": "Archived segment",
  "segment.restored": "Restored segment",
  "segment.duplicated": "Duplicated segment",
};

const ACTION_BADGE: Record<string, "success" | "warning" | "info" | "danger" | "default"> = {
  "segment.created": "success",
  "segment.updated": "info",
  "segment.deleted": "danger",
  "segment.archived": "warning",
  "segment.restored": "success",
  "segment.duplicated": "info",
};

export function SegmentHistoryModal({
  segmentId,
  onClose,
}: {
  segmentId: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      try {
        setLoading(true);
        const data = await getEntityAuditLog("segment", segmentId);
        setEntries(data);
      } catch (error) {
        console.error("Failed to load audit log:", error);
      } finally {
        setLoading(false);
      }
    }
    loadHistory();
  }, [segmentId]);

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Segment History"
      description="Timeline of changes"
      size="md"
    >
      <div className="p-5">
        {loading ? (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-500">Loading history…</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center">
            <History className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500">No history recorded yet</p>
          </div>
        ) : (
          <div className="relative pl-6">
            {/* Vertical line */}
            <div className="absolute bottom-2 left-[9px] top-2 w-px bg-slate-200 dark:bg-slate-700" />

            {entries.map((entry, i) => (
              <div key={entry.id} className="relative pb-6 last:pb-0">
                {/* Dot */}
                <div
                  className={cn(
                    "absolute left-[-15px] top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white dark:border-slate-900",
                    i === 0 ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-600"
                  )}
                />

                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {entry.actor_name || "System"}
                  </p>
                  <Badge variant={ACTION_BADGE[entry.action] || "default"}>
                    {ACTION_LABELS[entry.action] || entry.action}
                  </Badge>

                  {/* Show before/after metadata if available */}
                  {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                    <div className="mt-1.5 rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800/50">
                      {Object.entries(entry.metadata).map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400"
                        >
                          <span className="font-medium text-slate-700 dark:text-slate-600">
                            {key}:
                          </span>
                          <span>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {formatRelative(entry.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
