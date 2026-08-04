"use client";

import React, { useState, useMemo } from "react";
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown,
  ChevronLeft, ChevronRight, CheckSquare, Square
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldRenderer } from "./field-renderer";
import type { FieldDefinition } from "@/core/engine/types";
import { cn } from "@/lib/utils";

export interface ColumnDef<T = any> {
  key: string;
  label: string;
  fieldDef?: FieldDefinition;
  sortable?: boolean;
  visible?: boolean;
  render?: (row: T) => React.ReactNode;
}

export interface EntityTableProps<T = Record<string, any>> {
  data: T[];
  columns: ColumnDef<T>[];
  rowKey?: (row: T) => string;
  isLoading?: boolean;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  bulkActions?: {
    label: string;
    icon?: React.ReactNode;
    onClick: (selectedRows: T[]) => void;
    variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  }[];
  emptyState?: React.ReactNode;
}

export function EntityTable<T extends Record<string, any>>({
  data,
  columns: initialColumns,
  rowKey = (row) => row.id || JSON.stringify(row),
  isLoading = false,
  onRowClick,
  searchPlaceholder = "Search records...",
  bulkActions = [],
  emptyState,
}: EntityTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Filtered Data
  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      Object.values(row).some((val) => val && String(val).toLowerCase().includes(q))
    );
  }, [data, search]);

  // Sorted Data
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      const cmp = valA < valB ? -1 : 1;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredData, sortKey, sortDir]);

  // Paginated Data
  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, page]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleSelectAll = () => {
    if (selectedKeys.size === paginatedData.length) {
      setSelectedKeys(new Set());
    } else {
      const all = new Set(paginatedData.map(rowKey));
      setSelectedKeys(all);
    }
  };

  const toggleSelectRow = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedKeys(next);
  };

  const selectedRows = useMemo(() => {
    return data.filter((row) => selectedKeys.has(rowKey(row)));
  }, [data, selectedKeys, rowKey]);

  return (
    <div className="w-full space-y-4">
      {/* Table Toolbar: Search & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={searchPlaceholder}
            className="pl-9 h-9 text-xs"
          />
        </div>

        {/* Bulk Action Bar */}
        {selectedKeys.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-600">
              {selectedKeys.size} selected
            </span>
            {bulkActions.map((action, idx) => (
              <Button
                key={idx}
                size="sm"
                variant={action.variant || "outline"}
                onClick={() => action.onClick(selectedRows)}
                className="h-8 text-xs gap-1.5"
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[var(--muted)] text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="p-3.5 w-10 text-center">
                  <button onClick={toggleSelectAll} className="text-slate-400 hover:text-slate-600">
                    {selectedKeys.size > 0 && selectedKeys.size === paginatedData.length ? (
                      <CheckSquare className="h-4 w-4 text-blue-600" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                {initialColumns.map((col) => (
                  <th key={col.key} className="p-3.5 whitespace-nowrap">
                    {col.sortable !== false ? (
                      <button
                        onClick={() => handleSort(col.key)}
                        className="inline-flex items-center gap-1.5 hover:text-slate-800 dark:hover:text-slate-700"
                      >
                        {col.label}
                        {sortKey === col.key ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="p-4" colSpan={initialColumns.length + 1}>
                      <div className="h-4 bg-slate-100 dark:bg-[var(--muted)] rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={initialColumns.length + 1} className="p-8 text-center text-slate-400">
                    {emptyState || "No records found"}
                  </td>
                </tr>
              ) : (
                paginatedData.map((row) => {
                  const key = rowKey(row);
                  const isSelected = selectedKeys.has(key);
                  return (
                    <tr
                      key={key}
                      onClick={() => onRowClick?.(row)}
                      className={cn(
                        "hover:bg-slate-50/80 dark:hover:bg-[var(--muted)] transition-colors cursor-pointer",
                        isSelected && "bg-blue-50/40 dark:bg-blue-950/20"
                      )}
                    >
                      <td className="p-3.5 text-center" onClick={(e) => toggleSelectRow(key, e)}>
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                        )}
                      </td>
                      {initialColumns.map((col) => (
                        <td key={col.key} className="p-3.5 whitespace-nowrap">
                          {col.render ? (
                            col.render(row)
                          ) : col.fieldDef ? (
                            <FieldRenderer definition={col.fieldDef} value={row[col.key]} />
                          ) : (
                            <span className="text-slate-700 dark:text-slate-700">
                              {row[col.key] !== undefined && row[col.key] !== null ? String(row[col.key]) : "—"}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        <div className="flex items-center justify-between p-3.5 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
          <span>
            Showing {paginatedData.length > 0 ? (page - 1) * pageSize + 1 : 0} to{" "}
            {Math.min(page * pageSize, sortedData.length)} of {sortedData.length} entries
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 font-medium">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
