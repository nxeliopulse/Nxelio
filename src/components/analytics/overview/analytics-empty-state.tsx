import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Shown when the workspace has no leads/opportunities/campaigns at all yet —
 *  exact copy from the requirements doc §19. */
export function AnalyticsEmptyState() {
  return (
    <Card className="p-12 flex flex-col items-center text-center gap-3">
      <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center">
        <BarChart3 className="h-6 w-6 text-slate-400" />
      </div>
      <h3 className="text-base font-bold text-slate-900">Your analytics will appear here once you start engaging prospects.</h3>
      <p className="text-sm text-slate-500 max-w-md">Add prospects, launch a campaign and begin tracking your revenue journey.</p>
      <div className="flex gap-2 mt-2">
        <Link href="/leads"><Button variant="outline">Add Prospects</Button></Link>
        <Link href="/campaigns"><Button>Create Campaign</Button></Link>
      </div>
    </Card>
  );
}
