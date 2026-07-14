// Deliberately separate from the (app) route group — no sidebar, no
// workspace/subscription gating. This is the standalone platform admin panel,
// not part of the regular customer-facing app.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-950 text-slate-100">{children}</div>;
}
