"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown } from "lucide-react";
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllRead,
  markNotificationsRead,
  deleteNotifications,
  clearAllNotifications,
  type NotificationRow,
} from "@/lib/queries/notifications";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "<1m ago";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

type Tab = "unread" | "all" | "background";
const BACKGROUND_NOTIFICATION_TYPE = "lead_search_job";

export function NotificationsBell({ className }: { className?: string }) {
  const router = useRouter();
  const { confirm } = useFeedback();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<Tab>("unread");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      const [list, count] = await Promise.all([getNotifications(), getUnreadCount()]);
      setItems(list);
      setUnread(count);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch + populate on mount
    refresh();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setTypeMenuOpen(false); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const types = useMemo(
    () => Array.from(new Set(items.map((i) => i.type).filter((t): t is string => Boolean(t)))),
    [items]
  );

  const visible = useMemo(() => {
    let list = tab === "unread" ? items.filter((i) => !i.is_read)
      : tab === "background" ? items.filter((i) => i.type === BACKGROUND_NOTIFICATION_TYPE)
      : items;
    if (typeFilter) list = list.filter((i) => i.type === typeFilter);
    return list;
  }, [items, tab, typeFilter]);

  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visible.forEach((i) => next.delete(i.id));
        return next;
      }
      const next = new Set(prev);
      visible.forEach((i) => next.add(i.id));
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleItemClick(n: NotificationRow) {
    // Close + navigate immediately — don't make the click wait on a network
    // round trip. The read-receipt write happens in the background.
    setOpen(false);
    if (n.link) router.push(n.link);

    if (!n.is_read) {
      setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, is_read: true } : it)));
      setUnread((prev) => Math.max(0, prev - 1));
      markNotificationRead(n.id).catch(() => refresh());
    }
  }

  function handleMarkAll() {
    setItems((prev) => prev.map((it) => ({ ...it, is_read: true })));
    setUnread(0);
    markAllRead().catch(() => refresh());
  }

  async function handleClearAll() {
    if (!(await confirm({ title: "Clear all notifications?", message: "This removes every notification. This can't be undone.", confirmLabel: "Clear all", danger: true }))) return;
    setItems([]);
    setUnread(0);
    setSelected(new Set());
    clearAllNotifications().catch(() => refresh());
  }

  function handleBulkMarkRead() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const newlyRead = items.filter((it) => idSet.has(it.id) && !it.is_read).length;
    setItems((prev) => prev.map((it) => (idSet.has(it.id) ? { ...it, is_read: true } : it)));
    setUnread((prev) => Math.max(0, prev - newlyRead));
    setSelected(new Set());
    markNotificationsRead(ids).catch(() => refresh());
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!(await confirm({ title: `Delete ${ids.length} notification${ids.length > 1 ? "s" : ""}?`, message: "This can't be undone.", confirmLabel: "Delete", danger: true }))) return;
    const idSet = new Set(ids);
    const removedUnread = items.filter((it) => idSet.has(it.id) && !it.is_read).length;
    setItems((prev) => prev.filter((it) => !idSet.has(it.id)));
    setUnread((prev) => Math.max(0, prev - removedUnread));
    setSelected(new Set());
    deleteNotifications(ids).catch(() => refresh());
  }

  const countLabel = unread >= 10 ? "9+" : String(unread);
  const unreadCount = items.filter((i) => !i.is_read).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        className={cn(
          "relative flex items-center justify-center transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-[#1e242b]",
          className || "h-8 w-8 rounded-lg bg-[#2b323c] hover:bg-[#3a4451] border border-[#3a4451] text-slate-300 hover:text-white"
        )}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {countLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="lp-anim-pop origin-top-right absolute right-[-4.5rem] sm:right-0 top-full mt-1 w-[calc(100vw-2rem)] sm:w-[26rem] bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-50">
          {/* Title */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <p className="text-lg font-bold text-slate-900">Notifications</p>
            {items.length > 0 && (
              <button onClick={handleClearAll} className="text-xs font-medium text-slate-400 hover:text-red-600">
                Clear all
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-5 px-4 border-b border-slate-100">
            {([["unread", `Unread (${unreadCount})`], ["all", "All"], ["background", "Background Process"]] as [Tab, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => { setTab(id); setSelected(new Set()); }}
                className={cn(
                  "relative py-2.5 text-sm font-semibold transition-colors",
                  tab === id ? "text-slate-900" : "text-slate-400 hover:text-slate-600"
                )}
              >
                {label}
                {tab === id && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-slate-900 rounded-full" />}
              </button>
            ))}
          </div>

          {/* Toolbar: select all + type filter, or bulk actions when something's selected */}
          {visible.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50/60">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Select all
              </label>

              {selected.size > 0 ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{selected.size} selected</span>
                  <button onClick={handleBulkMarkRead} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                    Mark read
                  </button>
                  <button onClick={handleBulkDelete} className="text-xs font-medium text-red-500 hover:text-red-600">
                    Delete
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAll} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                      Mark all read
                    </button>
                  )}
                  {types.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setTypeMenuOpen((v) => !v)}
                        className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                      >
                        Type: {typeFilter ?? "All"} <ChevronDown className="h-3 w-3" />
                      </button>
                      {typeMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg border border-slate-200 shadow-lg py-1 z-10">
                          <button
                            onClick={() => { setTypeFilter(null); setTypeMenuOpen(false); }}
                            className={cn("w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50", !typeFilter ? "font-semibold text-slate-900" : "text-slate-600")}
                          >
                            All
                          </button>
                          {types.map((t) => (
                            <button
                              key={t}
                              onClick={() => { setTypeFilter(t); setTypeMenuOpen(false); }}
                              className={cn("w-full text-left px-3 py-1.5 text-xs capitalize hover:bg-slate-50", typeFilter === t ? "font-semibold text-slate-900" : "text-slate-600")}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {visible.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                {tab === "unread" ? "You're all caught up" : tab === "background" ? "No background searches running or finished yet" : "No notifications yet"}
              </div>
            ) : (
              <ul className="py-1">
                {visible.map((n) => (
                  <li key={n.id} className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected.has(n.id)}
                      onChange={() => toggleSelect(n.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                    />
                    <button onClick={() => handleItemClick(n)} className="flex-1 min-w-0 text-left flex gap-2">
                      <div className="flex-shrink-0 pt-1.5">
                        {!n.is_read ? (
                          <span className="block h-2 w-2 rounded-full bg-blue-500" />
                        ) : (
                          <span className="block h-2 w-2" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn("text-sm text-slate-900 truncate", !n.is_read ? "font-semibold" : "font-normal")}>
                            {n.title}
                          </p>
                          <span className="text-[11px] text-slate-400 flex-shrink-0 whitespace-nowrap">{relativeTime(n.created_at)}</span>
                        </div>
                        {n.message && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
