"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Sparkles } from "lucide-react";

export function LaunchCampaignModal({
  segmentId,
  segmentName,
  matchedCount,
  onClose,
}: {
  segmentId: string;
  segmentName: string;
  matchedCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [campaignName, setCampaignName] = useState(`${segmentName} Campaign`);
  const [channel, setChannel] = useState("email");

  function handleLaunch() {
    router.push(`/campaigns/builder?segmentId=${segmentId}&name=${encodeURIComponent(campaignName)}&channel=${channel}`);
  }

  return (
    <Modal open={true} onClose={onClose} title="Launch Campaign for Audience" description={`Enroll prospects from "${segmentName}"`} size="md">
      <div className="p-5 space-y-4 text-sm">
        <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Selected Audience</p>
            <p className="font-bold text-base">{segmentName}</p>
          </div>
          <Badge variant="blue" className="text-sm px-3 py-1">
            {matchedCount.toLocaleString()} prospects
          </Badge>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Campaign Name</label>
            <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="e.g. Q3 Outreach Campaign" />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Primary Channel</label>
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="email">Email Outreach</option>
              <option value="linkedin">LinkedIn Sequence</option>
              <option value="multichannel">Multi-Channel (Email + LinkedIn)</option>
            </Select>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleLaunch} disabled={!campaignName.trim()}>
            <Send className="h-4 w-4" /> Continue to Campaign Builder
          </Button>
        </div>
      </div>
    </Modal>
  );
}
