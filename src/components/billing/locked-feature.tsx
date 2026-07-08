import Link from "next/link";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Shown instead of a page's real content when the workspace's plan doesn't
 * include this feature — never an error, always a clear explanation + a way
 * to upgrade. Used for Opportunities, Meetings, and per-campaign Reply
 * Tracking (Pro-only features).
 */
export function LockedFeature({ feature, plan = "Pro" }: { feature: string; plan?: string }) {
  return (
    <div className="max-w-lg mx-auto mt-16">
      <Card className="p-8 text-center">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-5">
          <Lock className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">{feature} is a {plan} feature</h2>
        <p className="text-sm text-slate-500 mb-6">
          Upgrade to {plan} to unlock {feature.toLowerCase()}, along with everything else on that plan.
        </p>
        <Link href="/billing#plans">
          <Button className="w-full justify-center">Upgrade to {plan}</Button>
        </Link>
      </Card>
    </div>
  );
}
