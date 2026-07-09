"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Mail, MoreHorizontal, Send, Eye, Copy, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { useFeedback } from "@/components/ui/feedback";
import { deleteNewsletter, duplicateNewsletter, type NewsletterRow } from "@/lib/queries/newsletters";
import { formatDate } from "@/lib/utils";
import { NewsletterTemplateGallery } from "@/components/newsletters/newsletter-template-gallery";
import type { NewsletterTemplateCategory } from "@/lib/newsletter-templates";

const statusVariant: Record<string, "default" | "blue" | "warning" | "success" | "danger"> = {
  Draft: "default",
  Scheduled: "warning",
  Sending: "blue",
  Sent: "success",
  Failed: "danger",
};

interface Props {
  newsletters: NewsletterRow[];
  stats: { total: number; sent: number; avgOpenRate: number; avgClickRate: number };
}

export function NewslettersView({ newsletters, stats }: Props) {
  const router = useRouter();
  const { confirm } = useFeedback();
  const [search, setSearch] = useState("");
  const [templateCatFilter, setTemplateCatFilter] = useState<"All" | NewsletterTemplateCategory>("All");
  const [pending, start] = useTransition();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  // Fixed (viewport-relative) menu position so the dropdown isn't clipped by the
  // card's overflow-hidden / the table's horizontal scroll container.
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  const filtered = newsletters.filter(
    (n) => !search || n.title.toLowerCase().includes(search.toLowerCase()) || (n.subject || "").toLowerCase().includes(search.toLowerCase())
  );

  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete newsletter?", message: "Delete this newsletter?", confirmLabel: "Delete", danger: true }))) return;
    start(async () => { await deleteNewsletter(id); });
    setMenuOpen(null);
  }

  function handleDuplicate(id: string) {
    start(async () => { await duplicateNewsletter(id); });
    setMenuOpen(null);
  }

  if (newsletters.length === 0) {
    return (
      <div className="max-w-[1600px] mx-auto">
        <PageHeader title="Newsletters" description="Send rich content updates to your subscribed leads" />
        <NewsletterTemplateGallery
          catFilter={templateCatFilter}
          onCatFilterChange={setTemplateCatFilter}
          onPick={(templateId) => router.push(`/newsletters/builder?template=${templateId}`)}
          onBlank={() => router.push("/newsletters/builder")}
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="Newsletters"
        description="Send rich content updates to your subscribed leads"
        actions={
          <Link href="/newsletters/builder">
            <Button><Plus className="h-4 w-4" /> New newsletter</Button>
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total newsletters", value: stats.total, color: "text-blue-600 bg-blue-50" },
          { label: "Sent", value: stats.sent, color: "text-emerald-600 bg-emerald-50" },
          { label: "Avg. open rate", value: `${stats.avgOpenRate}%`, color: "text-indigo-600 bg-indigo-50" },
          { label: "Avg. click rate", value: `${stats.avgClickRate}%`, color: "text-amber-600 bg-amber-50" },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>
              <Mail className="h-4 w-4" />
            </div>
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-xl font-bold text-slate-900">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <Input
            leftIcon={<Search className="h-4 w-4" />}
            placeholder="Search newsletters..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <h3 className="font-semibold text-slate-900 mb-1">No matches</h3>
            <p className="text-sm text-slate-500">No newsletters match &quot;{search}&quot;.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-semibold">Title</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Recipients</th>
                  <th className="px-4 py-3 font-semibold">Open rate</th>
                  <th className="px-4 py-3 font-semibold">Click rate</th>
                  <th className="px-4 py-3 font-semibold">Sent</th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((n) => {
                  const openRate = n.sent_count > 0 ? Math.round((n.open_count / n.sent_count) * 1000) / 10 : 0;
                  const clickRate = n.sent_count > 0 ? Math.round((n.click_count / n.sent_count) * 1000) / 10 : 0;
                  return (
                    <tr key={n.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/newsletters/builder?id=${n.id}`} className="block group">
                          <p className="font-medium text-slate-900 group-hover:text-blue-600">{n.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{n.subject || "(no subject)"}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3"><Badge variant={statusVariant[n.status] || "default"}>{n.status}</Badge></td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{n.recipient_count.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {n.sent_count > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${openRate}%` }} />
                            </div>
                            <span className="text-slate-700 font-medium">{openRate}%</span>
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {n.sent_count > 0 ? <span className="text-amber-700 font-medium">{clickRate}%</span> : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{n.sent_at ? formatDate(n.sent_at) : "—"}</td>
                      <td className="px-4 py-3 relative">
                        <button
                          onClick={(e) => {
                            if (menuOpen === n.id) { setMenuOpen(null); return; }
                            const r = e.currentTarget.getBoundingClientRect();
                            setMenuPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
                            setMenuOpen(n.id);
                          }}
                          className="p-1.5 rounded-md hover:bg-slate-100"
                        >
                          <MoreHorizontal className="h-4 w-4 text-slate-400" />
                        </button>
                        {menuOpen === n.id && menuPos && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
                            <div className="fixed z-50 w-44 bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden" style={{ top: menuPos.top, right: menuPos.right }}>
                              <Link
                                href={`/newsletters/builder?id=${n.id}`}
                                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                onClick={() => setMenuOpen(null)}
                              >
                                <Eye className="h-3.5 w-3.5" /> Edit
                              </Link>
                              <button
                                onClick={() => handleDuplicate(n.id)}
                                disabled={pending}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                              >
                                <Copy className="h-3.5 w-3.5" /> Duplicate
                              </button>
                              {n.status === "Draft" && (
                                <Link
                                  href={`/newsletters/builder?id=${n.id}&send=1`}
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
                                  onClick={() => setMenuOpen(null)}
                                >
                                  <Send className="h-3.5 w-3.5" /> Send now
                                </Link>
                              )}
                              <button
                                onClick={() => handleDelete(n.id)}
                                disabled={pending}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
