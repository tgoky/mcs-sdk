"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Bell, AlertTriangle, XCircle, Clock, KeyRound } from "lucide-react";

interface NotificationRow {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  runId: string | null;
  engagementId: string | null;
  read: boolean;
  createdAt: string;
}

const POLL_MS = 30_000;

function iconFor(type: string) {
  if (type === "run_failed") return <XCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />;
  if (type === "run_timed_out") return <Clock size={14} className="text-amber-400 shrink-0 mt-0.5" />;
  if (type === "credential_invalid" || type === "credential_check_error")
    return <KeyRound size={14} className="text-amber-400 shrink-0 mt-0.5" />;
  return <AlertTriangle size={14} className="text-zinc-400 shrink-0 mt-0.5" />;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The "app" notification channel from the reliability pass — this is what
 * lets a buyer see a failed/timed-out run or a dead credential without
 * having to already be looking at the run or credentials page. Polls
 * /api/notifications every 30s; the same table also fans out to Slack/email
 * (see src/lib/notify.ts), but this is the channel every tenant has by
 * default with zero setup.
 */
export function NotificationBell() {
  const [notifs, setNotifs] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setNotifs(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Silent — a failed poll shouldn't throw a visible error at the user,
      // it'll just try again on the next interval.
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function markAllRead() {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await fetch("/api/notifications/all/read", { method: "POST" }).catch(() => {});
  }

  async function markRead(id: string) {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => {});
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center w-8 h-8 text-zinc-400 hover:text-zinc-200 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-medium text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl z-50">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-900 sticky top-0 bg-zinc-950">
            <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifs.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-zinc-600">
              Nothing yet — you'll see run failures and connection issues here.
            </div>
          ) : (
            notifs.map((n) => {
              const content = (
                <div
                  className={`flex gap-2.5 px-3 py-2.5 border-b border-zinc-900 last:border-b-0 hover:bg-zinc-900/50 transition-colors ${
                    n.read ? "opacity-60" : ""
                  }`}
                >
                  {iconFor(n.type)}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-zinc-200 font-medium leading-snug">
                      {n.title}
                    </p>
                    <p className="text-[11px] text-zinc-500 leading-snug mt-0.5 line-clamp-2">
                      {n.body}
                    </p>
                    <p className="text-[10px] text-zinc-700 mt-1">{relativeTime(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0 mt-1.5" />
                  )}
                </div>
              );

              return n.runId ? (
                <Link
                  key={n.id}
                  href={`/dashboard/runs/${n.runId}`}
                  onClick={() => !n.read && markRead(n.id)}
                >
                  {content}
                </Link>
              ) : (
                <button
                  key={n.id}
                  onClick={() => !n.read && markRead(n.id)}
                  className="w-full text-left"
                >
                  {content}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
