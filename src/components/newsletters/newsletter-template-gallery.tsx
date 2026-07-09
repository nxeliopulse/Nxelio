"use client";
import Link from "next/link";
import { ArrowLeft, Plus, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { newsletterTemplates, NEWSLETTER_TEMPLATE_CATEGORIES, type NewsletterTemplateCategory } from "@/lib/newsletter-templates";

/** Template gallery — shared between the newsletter builder's first screen and the list page's empty state. */
export function NewsletterTemplateGallery({ catFilter, onCatFilterChange, onPick, onBlank, backHref }: {
  catFilter: "All" | NewsletterTemplateCategory;
  onCatFilterChange: (c: "All" | NewsletterTemplateCategory) => void;
  onPick: (id: string) => void;
  onBlank: () => void;
  /** Omit to hide the "Back to newsletters" link (e.g. when already embedded on that page). */
  backHref?: string;
}) {
  const visible = newsletterTemplates.filter((t) => catFilter === "All" || t.category === catFilter);
  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          {backHref && (
            <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-2">
              <ArrowLeft className="h-4 w-4" /> Back to newsletters
            </Link>
          )}
          <h2 className="text-xl font-bold text-slate-900">Choose a template</h2>
          <p className="text-sm text-slate-500">Start from a template, or begin with a blank newsletter.</p>
        </div>
        <Button variant="outline" onClick={onBlank}><Plus className="h-4 w-4" /> Start blank</Button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {NEWSLETTER_TEMPLATE_CATEGORIES.map((c) => (
          <button key={c} onClick={() => onCatFilterChange(c)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${catFilter === c ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {c}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card className="p-12 text-center text-sm text-slate-500">No templates in this category.</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((t) => {
            const Icon = t.icon;
            const imageBlock = t.blocks.find((b) => (b.type === "image" || b.type === "section") && b.url);
            return (
              <button key={t.id} onClick={() => onPick(t.id)}
                className="group relative text-left bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-blue-300 hover:shadow-md transition-all">
                <div className="relative h-36 bg-white border-b border-slate-100 overflow-hidden">
                  {imageBlock ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageBlock.url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="p-3 flex flex-col gap-1.5 h-full justify-center">
                      {t.blocks.slice(0, 4).map((b, i) => {
                        if (b.type === "banner") {
                          return (
                            <div key={i} className="rounded px-2 py-1.5 text-[10px] font-bold truncate" style={{ background: b.color, color: b.textColor }}>
                              {b.text}
                            </div>
                          );
                        }
                        if (b.type === "cta") {
                          return (
                            <div key={i} className="self-center rounded px-3 py-1 text-[9px] font-semibold text-white mt-1" style={{ background: b.color }}>
                              {b.text}
                            </div>
                          );
                        }
                        if (b.type === "heading") return <div key={i} className="h-1.5 w-2/3 rounded-full bg-slate-300" />;
                        if (b.type === "divider") return <div key={i} className="h-px w-full bg-slate-100" />;
                        if (b.type === "section") {
                          return (
                            <div key={i} className="rounded px-2 py-1.5 text-[9px] font-semibold truncate" style={{ background: b.color || "#f1f5f9", color: "#0f172a" }}>
                              {b.heading || b.eyebrow || "Section"}
                            </div>
                          );
                        }
                        return <div key={i} className="h-1.5 w-full rounded-full bg-slate-100" />;
                      })}
                    </div>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                      <Eye className="h-3.5 w-3.5" /> Use template
                    </span>
                  </span>
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${t.accent}`}><Icon className="h-3.5 w-3.5" /></span>
                    <p className="font-semibold text-slate-900 text-sm group-hover:text-blue-700 truncate">{t.name}</p>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
