"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllRead,
  type NotificationRow,
} from "@/lib/queries/notifications";

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

export function NotificationsBell() {
  const router = useRouter();
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
    refresh();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleItemClick(n: NotificationRow) {
    if (!n.is_read) {
      try {
        await markNotificationRead(n.id);
      } catch {
        // ignore
      }
    }
    setOpen(false);
    if (n.link) {
      router.push(n.link);
    }
    refresh();
  }

  async function handleMarkAll() {
    try {
      await markAllRead();
    } catch {
      // ignore
    }
    refresh();
  }

  const countLabel = unread >= 10 ? "9+" : String(unread);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative h-9 w-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600"
      >
        <Bell className="h-4.5 w-4.5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {countLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden z-40">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <button
              onClick={handleMarkAll}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Mark all read
            </button>
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
