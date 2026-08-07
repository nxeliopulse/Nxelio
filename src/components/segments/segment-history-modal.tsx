"use client";

import { useState, useEffect } from "react";
import { History, RotateCcw, GitCompare, Layers } from "lucide-react";
import { getEntityAuditLog, type AuditLogRow } from "@/lib/queries/audit-log";
import { getSegmentVersions, type SegmentVersionRow } from "@/lib/queries/segments";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { formatRelative, cn } from "@/lib/utils";
import type { Group } from "@/lib/segments";

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
  onRestoreVersion,
}: {
  segmentId: string;
  onClose: () => void;
  onRestoreVersion?: (rule: Group) => void;
}) {
  const [activeTab, setActiveTab] = useState<"versions" | "audit">("versions");
  const [entries, setEntries] = useState<AuditLogRow[]>([]);
  const [versions, setVersions] = useState<SegmentVersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [auditData, versionData] = await Promise.all([
          getEntityAuditLog("segment", segmentId),
          getSegmentVersions(segmentId),
        ]);
        setEntries(auditData);
        setVersions(versionData);
      } catch (error) {
        console.error("Failed to load history data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [segmentId]);

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Segment History & Versions"
      description="View audit log, compare saved versions, and restore prior rule sets"
      size="lg"
    >
      <div className="p-5 space-y-4">
        <Tabs
          tabs={[
            { id: "versions", label: `Saved Versions (${versions.length})`, icon: <Layers className="h-3.5 w-3.5" /> },
            { id: "audit", label: `Audit Log (${entries.length})`, icon: <History className="h-3.5 w-3.5" /> },
          ]}
          active={activeTab}
          onChange={(id) => setActiveTab(id as "versions" | "audit")}
        />

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Loading history…</div>
        ) : activeTab === "versions" ? (
          <div className="space-y-3">
            {versions.length === 0 ? (
              <div className="py-10 text-center">
                <Layers className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-500">No rule snapshots saved yet</p>
              </div>
            ) : (
              versions.map((ver) => {
                const isComparing = compareVersionId === ver.id;
                return (
                  <div key={ver.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="blue">Version {ver.version_number}</Badge>
                        <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                          {ver.version_label || `Version ${ver.version_number}`}
                        </span>
                        <span className="text-xs text-slate-400">— {formatRelative(ver.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCompareVersionId(isComparing ? null : ver.id)}
                        >
                          <GitCompare className="h-3.5 w-3.5" /> {isComparing ? "Hide Diff" : "Compare"}
                        </Button>
                        {onRestoreVersion && (
                          <Button
                            size="sm"
                            onClick={() => {
                              onRestoreVersion(ver.rule_json);
                              onClose();
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Rules Diff Comparison */}
                    {isComparing && (
                      <div className="mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-mono overflow-x-auto">
                        <p className="font-sans font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-1">
                          Rule Tree Snapshot (JSON)
                        </p>
                        <pre className="text-slate-700 dark:text-slate-300">
                          {JSON.stringify(ver.rule_json, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Audit Log Timeline */
          entries.length === 0 ? (
            <div className="py-10 text-center">
              <History className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500">No audit logs recorded yet</p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-4">
              <div className="absolute bottom-2 left-[9px] top-2 w-px bg-slate-200 dark:bg-slate-700" />
              {entries.map((entry, i) => (
                <div key={entry.id} className="relative pb-2 last:pb-0">
                  <div
                    className={cn(
                      "absolute left-[-15px] top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white dark:border-slate-900",
                      i === 0 ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-600"
                    )}
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        {entry.actor_name || "System"}
                      </span>
                      <Badge variant={ACTION_BADGE[entry.action] || "default"}>
                        {ACTION_LABELS[entry.action] || entry.action}
                      </Badge>
                      <span className="text-xs text-slate-400">{formatRelative(entry.created_at)}</span>
                    </div>

                    {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                      <div className="mt-1 rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-800/50">
                        {Object.entries(entry.metadata).map(([key, value]) => (
                          <div key={key} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                            <span className="font-medium text-slate-700 dark:text-slate-300">{key}:</span>
                            <span>{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </Modal>
  );
}
