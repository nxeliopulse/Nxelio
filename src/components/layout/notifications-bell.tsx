"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllRead,
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

export function NotificationsBell({ className }: { className?: string }) {
  const router = useRouter();
  const { confirm } = useFeedback();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
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
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
    clearAllNotifications().catch(() => refresh());
  }

  const countLabel = unread >= 10 ? "9+" : String(unread);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
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
        <div className="lp-anim-pop origin-top-right absolute right-0 top-full mt-1 w-80 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleMarkAll}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                Mark all read
              </button>
              {items.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-xs font-medium text-slate-400 hover:text-red-600"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                No notifications yet
              </div>
            ) : (
              <ul className="py-1">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => handleItemClick(n)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 flex gap-3"
                    >
                      <div className="flex-shrink-0 pt-1.5">
                        {!n.is_read ? (
                          <span className="block h-2 w-2 rounded-full bg-blue-500" />
                        ) : (
                          <span className="block h-2 w-2" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={
                            "text-sm text-slate-900 truncate " +
                            (!n.is_read ? "font-semibold" : "font-normal")
                          }
                        >
                          {n.title}
                        </p>
                        {n.message && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                        )}
                        <p className="text-[11px] text-slate-400 mt-1">
                          {relativeTime(n.created_at)}
                        </p>
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
