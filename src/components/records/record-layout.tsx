"use client";

import React, { useState } from "react";
import { RecordHeader } from "./record-header";
import { RecordSection } from "./record-section";
import type { LayoutConfig } from "@/core/engine/types";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
  badge?: string | number;
}

export interface RecordLayoutProps {
  breadcrumbHref: string;
  breadcrumbLabel: string;
  icon: React.ReactNode;
  iconClassName?: string;
  eyebrow: string;
  title: string;
  badges?: React.ReactNode;
  headline?: React.ReactNode;
  onEdit?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  moreMenu?: React.ReactNode;
  pipelineBar?: React.ReactNode;
  layoutConfig?: LayoutConfig;
  record?: Record<string, any>;
  tabs: TabItem[];
  defaultTabId?: string;
  sidebar?: React.ReactNode;
  children?: React.ReactNode;
}

export function RecordLayout({
  breadcrumbHref,
  breadcrumbLabel,
  icon,
  iconClassName,
  eyebrow,
  title,
  badges,
  headline,
  onEdit,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  moreMenu,
  pipelineBar,
  layoutConfig,
  record,
  tabs,
  defaultTabId,
  sidebar,
  children,
}: RecordLayoutProps) {
  const [activeTabId, setActiveTabId] = useState<string>(
    defaultTabId || (tabs.length > 0 ? tabs[0].id : "")
  );

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="w-full pb-12">
      {/* Top Record Header */}
      <RecordHeader
        breadcrumbHref={breadcrumbHref}
        breadcrumbLabel={breadcrumbLabel}
        icon={icon}
        iconClassName={iconClassName}
        eyebrow={eyebrow}
        title={title}
        badges={badges}
        headline={headline}
        onEdit={onEdit}
        onPrev={onPrev}
        onNext={onNext}
        prevDisabled={prevDisabled}
        nextDisabled={nextDisabled}
        moreMenu={moreMenu}
      />

      {/* Pipeline / Stage Progress Bar */}
      {pipelineBar && <div className="mb-6">{pipelineBar}</div>}

      {/* Main Body Grid: Main Content Tabs vs Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left / Main Content (8 cols when sidebar present, 12 cols otherwise) */}
        <div className={cn("min-w-0 flex flex-col gap-5", sidebar ? "lg:col-span-8" : "lg:col-span-12")}>
          {/* Tab Navigation */}
          {tabs.length > 0 && (
            <div className="border-b border-slate-200 dark:border-slate-800">
              <nav className="-mb-px flex gap-6 overflow-x-auto scrollbar-none" aria-label="Tabs">
                {tabs.map((tab) => {
                  const isActive = tab.id === activeTabId;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTabId(tab.id)}
                      className={cn(
                        "whitespace-nowrap py-3 px-1 border-b-2 text-sm font-semibold transition-colors flex items-center gap-2",
                        isActive
                          ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                          : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-500 dark:hover:text-slate-700"
                      )}
                    >
                      {tab.label}
                      {tab.badge !== undefined && (
                        <span
                          className={cn(
                            "px-2 py-0.5 text-xs font-semibold rounded-full",
                            isActive
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                              : "bg-slate-100 text-slate-600 dark:bg-[var(--muted)] dark:text-slate-500"
                          )}
                        >
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          )}

          {/* Active Tab Content */}
          <div className="pt-2">
            {activeTab?.content}
            {/* Direct Section Metadata rendering if passed */}
            {activeTabId === "overview" && layoutConfig && record && (
              <div className="space-y-4">
                {layoutConfig.sections.map((section) => (
                  <RecordSection key={section.id} section={section} record={record} />
                ))}
              </div>
            )}
            {children}
          </div>
        </div>

        {/* Right Sidebar (4 cols) */}
        {sidebar && <div className="lg:col-span-4 space-y-5">{sidebar}</div>}
      </div>
    </div>
  );
}
