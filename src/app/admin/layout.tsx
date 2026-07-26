// Deliberately separate from the (app) route group — no sidebar, no
// workspace/subscription gating. This is the standalone platform admin panel,
// not part of the regular customer-facing app.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#090d16] text-slate-900 dark:text-slate-100 selection:bg-[#18A7B8] selection:text-white transition-colors duration-200">
      {children}
    </div>
  );
}



