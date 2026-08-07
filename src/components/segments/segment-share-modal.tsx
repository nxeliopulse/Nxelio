"use client";
import { useState, useEffect, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import { Share2, Trash2, Users, UserCheck } from "lucide-react";
import { getSegmentShares, saveSegmentShare, removeSegmentShare, type SegmentShareRow } from "@/lib/queries/segments";

export function SegmentShareModal({ segmentId, segmentName, onClose }: { segmentId: string; segmentName: string; onClose: () => void }) {
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [shares, setShares] = useState<SegmentShareRow[]>([]);
  const [granteeType, setGranteeType] = useState<"user" | "team">("user");
  const [granteeId, setGranteeId] = useState("");
  const [permissionLevel, setPermissionLevel] = useState<"view" | "edit">("view");

  useEffect(() => {
    getSegmentShares(segmentId).then(setShares).catch(() => {});
  }, [segmentId]);

  function handleAddShare() {
    if (!granteeId.trim()) return;
    start(async () => {
      await saveSegmentShare(segmentId, granteeType, granteeId.trim(), permissionLevel);
      const updated = await getSegmentShares(segmentId);
      setShares(updated);
      setGranteeId("");
      toast("Sharing permissions updated", "success");
    });
  }

  function handleRemoveShare(id: string) {
    start(async () => {
      await removeSegmentShare(id);
      setShares((prev) => prev.filter((s) => s.id !== id));
      toast("Share removed", "success");
    });
  }

  return (
    <Modal open={true} onClose={onClose} title={`Share "${segmentName}"`} description="Grant access permissions to users or teams" size="md">
      <div className="p-5 space-y-4 text-sm">
        <div className="flex items-center gap-2">
          <Select value={granteeType} onChange={(e) => setGranteeType(e.target.value as "user" | "team")} className="w-28 text-xs">
            <option value="user">User</option>
            <option value="team">Team</option>
          </Select>
          <input
            type="text"
            value={granteeId}
            onChange={(e) => setGranteeId(e.target.value)}
            placeholder={granteeType === "user" ? "user@company.com" : "Sales Team"}
            className="flex-1 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
          />
          <Select value={permissionLevel} onChange={(e) => setPermissionLevel(e.target.value as "view" | "edit")} className="w-28 text-xs">
            <option value="view">Can view</option>
            <option value="edit">Can edit</option>
          </Select>
          <Button size="sm" onClick={handleAddShare} disabled={pending || !granteeId.trim()}>
            Add
          </Button>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">People & Teams with access</p>
          {shares.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center">Only you have access to this segment</p>
          ) : (
            shares.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs">
                <div className="flex items-center gap-2">
                  {s.grantee_type === "team" ? <Users className="h-4 w-4 text-purple-600" /> : <UserCheck className="h-4 w-4 text-blue-600" />}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{s.grantee_id}</span>
                  <Badge variant={s.grantee_type === "team" ? "purple" : "blue"}>{s.grantee_type}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={s.permission_level === "edit" ? "success" : "default"}>
                    {s.permission_level === "edit" ? "Can edit" : "Can view"}
                  </Badge>
                  <button onClick={() => handleRemoveShare(s.id)} className="p-1 text-slate-400 hover:text-rose-600 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
