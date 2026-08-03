import Link from "next/link";
import { Lock, Briefcase, Calendar, Reply, type LucideIcon } from "lucide-react";

/**
 * Shown instead of a page's real content when the workspace's plan doesn't
 * include this feature — never an error, always a clear explanation + a way
 * to upgrade. Used for Opportunities, Meetings, and per-campaign Reply
 * Tracking.
 */
const FEATURE_STYLE: Record<string, { icon: LucideIcon; bg: string; fg: string; desc: string }> = {
  Opportunities: {
    icon: Briefcase, bg: "bg-blue-50", fg: "text-blue-600",
    desc: "Track deals through your pipeline, from first contact to closed-won.",
  },
  Meetings: {
    icon: Calendar, bg: "bg-purple-50", fg: "text-purple-600",
    desc: "Book, manage, and sync meetings straight from your calendar.",
  },
  "Reply Tracking": {
    icon: Reply, bg: "bg-pink-50", fg: "text-pink-600",
    desc: "See every open, click, and reply — right in your inbox.",
  },
};

export function LockedFeature({ feature, plan = "Pro" }: { feature: string; plan?: string }) {
  const style = FEATURE_STYLE[feature] ?? { icon: Lock, bg: "bg-indigo-50", fg: "text-indigo-600", desc: `Upgrade to ${plan} to unlock ${feature.toLowerCase()}.` };
  const Icon = style.icon;
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] w-full p-4">
      <div className="max-w-lg w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between mb-6">
          <div className={`h-14 w-14 rounded-2xl ${style.bg} ${style.fg} flex items-center justify-center`}>
            <Icon className="h-7 w-7" />
          </div>
          <Link
            href="/billing#plans"
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors shrink-0"
          >
            <Lock className="h-3.5 w-3.5" />
            Upgrade
          </Link>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">{feature}</h2>
        <p className="text-base text-slate-500">{style.desc}</p>
        <p className="text-sm text-slate-400 mt-4">{plan}+ plan required</p>
      </div>
    </div>
  );
}
