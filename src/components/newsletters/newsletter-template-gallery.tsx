"use client";
import Link from "next/link";
import { ArrowLeft, Plus, Eye, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { newsletterTemplates, NEWSLETTER_TEMPLATE_CATEGORIES, type NewsletterTemplateCategory } from "@/lib/newsletter-templates";
import { cn } from "@/lib/utils";

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
    <div className="max-w-[1600px] mx-auto space-y-3.5">
      {/* Header section (Compact & Responsive) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          {backHref && (
            <Link href={backHref} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-500 hover:text-[#18A7B8] mb-1 transition-colors">
              <ArrowLeft className="h-3 w-3" /> Back to newsletters
            </Link>
          )}
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Choose a Template</h2>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
            Select a template to customize or start with a blank design.
          </p>
        </div>

        {/* Action button & category filter combined for high density */}
        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-900 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800">
            {NEWSLETTER_TEMPLATE_CATEGORIES.map((c) => {
              const isActive = catFilter === c;
              return (
                <button
                  key={c}
                  onClick={() => onCatFilterChange(c)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                    isActive
                      ? "bg-[#18A7B8] text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-600 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>

          <Button
            variant="outline"
            onClick={onBlank}
            className="rounded-xl font-bold border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 gap-1.5 text-xs h-8 px-3"
          >
            <Plus className="h-3.5 w-3.5 text-[#18A7B8]" /> Blank
          </Button>
        </div>
      </div>

      {/* Zero-Scroll Responsive Template Grid (4 columns on desktop, compact cards) */}
      {visible.length === 0 ? (
        <Card className="p-12 text-center text-xs text-slate-400 dark:text-slate-500 rounded-2xl border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
          No templates available in this category.
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {visible.map((t) => {
            const Icon = t.icon;
            const imageBlock = t.blocks.find((b) => (b.type === "image" || b.type === "section") && b.url);
            return (
              <button
                key={t.id}
                onClick={() => onPick(t.id)}
                className="group relative text-left bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden hover:border-[#18A7B8]/60 hover:shadow-lg transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  {/* Compact Preview Banner */}
                  <div className="relative h-24 sm:h-28 bg-slate-50 dark:bg-slate-950 overflow-hidden border-b border-slate-100 dark:border-slate-800">
                    {imageBlock ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageBlock.url}
                        alt={t.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="p-2 flex flex-col gap-1 h-full justify-center bg-slate-50/50 dark:bg-[var(--muted)]">
                        {t.blocks.slice(0, 3).map((b, i) => {
                          if (b.type === "banner") {
                            return (
                              <div key={i} className="rounded px-2 py-1 text-[9px] font-bold truncate" style={{ background: b.color, color: b.textColor }}>
                                {b.text}
                              </div>
                            );
                          }
                          if (b.type === "cta") {
                            return (
                              <div key={i} className="self-center rounded px-2 py-1 text-[8px] font-bold text-white shadow-xs mt-0.5" style={{ background: b.color }}>
                                {b.text}
                              </div>
                            );
                          }
                          if (b.type === "heading") return <div key={i} className="h-1.5 w-2/3 rounded-full bg-slate-300 dark:bg-slate-700" />;
                          return <div key={i} className="h-1 w-full rounded-full bg-slate-200 dark:bg-slate-800" />;
                        })}
                      </div>
                    )}

                    {/* Category Pill Badge */}
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-slate-900/80 text-white backdrop-blur-md text-[9px] font-bold uppercase tracking-wider z-10">
                      {t.category}
                    </span>

                    {/* Hover Overlay */}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-all duration-200">
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#18A7B8] hover:bg-[#14929f] text-white text-xs font-bold px-3 py-1.5 shadow-md">
                        <Eye className="h-3.5 w-3.5" /> Use Template
                      </span>
                    </span>
                  </div>

                  {/* Card Info */}
                  <div className="p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-6 w-6 rounded-lg flex items-center justify-center flex-shrink-0 font-bold ${t.accent}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <p className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm group-hover:text-[#18A7B8] transition-colors truncate">
                        {t.name}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-500 font-medium line-clamp-1 leading-normal">
                      {t.description}
                    </p>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-50/50 dark:bg-slate-950/40">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Ready
                  </span>
                  <span className="text-[#18A7B8] font-bold group-hover:underline">
                    Preview →
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
