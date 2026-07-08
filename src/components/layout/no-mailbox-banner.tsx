import Link from "next/link";
import { MailWarning, ArrowRight } from "lucide-react";

/**
 * LP-2 — shown across the app whenever the workspace has no connected mailbox,
 * so the user knows to fix it. Intentionally NOT dismissible: it appears only
 * when no mailbox is connected and disappears on its own once one is linked.
 */
export function NoMailboxBanner() {
  return (
    <div className="mx-3 sm:mx-4 lg:mx-6 mt-3 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
      <span className="h-8 w-8 rounded-lg bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
        <MailWarning className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900">No mailbox connected</p>
        <p className="text-xs text-amber-700/80">Connect your Gmail or Outlook inbox to send campaigns and capture replies inside Nxelio.</p>
      </div>
      <Link
        href="/settings?section=email"
        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 text-white px-3 py-1.5 text-sm font-medium hover:bg-amber-600 transition-colors whitespace-nowrap flex-shrink-0"
      >
        Connect mailbox <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
