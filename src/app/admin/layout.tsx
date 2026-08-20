import { redirect } from "next/navigation";
import { FeedbackProvider } from "@/components/ui/feedback";
import { isPlatformAdmin } from "@/lib/queries/platform-admin";

// Deliberately separate from the (app) route group — no sidebar, no
// workspace/subscription gating. This is the standalone platform admin panel,
// not part of the regular customer-facing app. FeedbackProvider is still
// needed here (self-contained toast/confirm modals, no app-shell coupling) —
// the WhatsApp connector's disconnect confirmation uses useFeedback().
//
// The platform-admin check lives HERE, not in individual pages — previously
// it was only in admin/page.tsx, so any new page added under /admin later
// would be wide open by default unless someone remembered to copy the check.
// Gating it in the shared layout means every current and future page under
// /admin is covered automatically.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isPlatformAdmin())) redirect("/login");

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#090d16] text-slate-900 dark:text-slate-800 selection:bg-[#18A7B8] selection:text-white transition-colors duration-200">
      <FeedbackProvider>{children}</FeedbackProvider>
    </div>
  );
}



