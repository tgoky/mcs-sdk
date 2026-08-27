"use client";

// src/app/dashboard/notification-bell.tsx
//
// 2026-08-23: this used to be a self-contained bell + floating dropdown.
// It's now a presentational list only (NotificationList) — the bell icon
// lives in right-utility-rail.tsx, the sliding/pushing panel it opens into
// lives in right-utility-panel.tsx, and the polling/read-state logic moved
// to use-notifications.ts so the rail's unread badge and this list share
// one poller. Kept in this file (not renamed) since it's still exactly
// "the notifications feature," just restructured.

import Link from "next/link";
import { Bell, AlertTriangle, XCircle, Clock, KeyRound, RotateCcw, BarChart3, Radio } from "lucide-react";
import type { NotificationRow } from "./use-notifications";

function iconFor(type: string) {
  if (type === "run_failed") return <XCircle size={14} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />;
  if (type === "run_timed_out") return <Clock size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />;
  if (type === "credential_invalid" || type === "credential_check_error")
    return <KeyRound size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />;
  if (type === "lost_deal_swept") return <RotateCcw size={14} className="text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />;
  if (type === "weekly_metrics") return <BarChart3 size={14} className="text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />;
  if (type === "conversation_intelligence_objection_found")
    return <Radio size={14} className="text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />;
  return <AlertTriangle size={14} className="text-zinc-500 dark:text-zinc-400 shrink-0 mt-0.5" />;
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

interface NotificationListProps {
  notifs: NotificationRow[];
  unreadCount: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  /** Closes the host panel — passed through so a click on a notification
   * that navigates via Link doesn't leave the panel open behind it. */
  onNavigate?: () => void;
}

/**
 * The "app" notification channel from the reliability pass — this is what
 * lets a buyer see a failed/timed-out run or a dead credential without
 * having to already be looking at the run or credentials page. The same
 * table also fans out to Slack/email (see src/lib/notify.ts); this is the
 * in-app channel every tenant has by default with zero setup.
 */
export function NotificationList({ notifs, unreadCount, markAllRead, markRead, onNavigate }: NotificationListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <span className="text-xs font-bold font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          Notifications
        </span>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-[11px] font-mono font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            [ Mark all read ]
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {notifs.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs font-mono font-medium text-zinc-400 dark:text-zinc-600">
            Nothing yet — you&apos;ll see run failures and connection issues here.
          </div>
        ) : (
          notifs.map((n) => {
            const content = (
              <div
                className={`flex gap-2.5 px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-900/60 last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors text-left w-full ${
                  n.read ? "opacity-50" : ""
                }`}
              >
                {iconFor(n.type)}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-zinc-800 dark:text-zinc-200 font-semibold leading-snug">
                    {n.title}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug mt-0.5 line-clamp-2">
                    {n.body}
                  </p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono mt-1">{relativeTime(n.createdAt)}</p>
                </div>
                {!n.read && (
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0 mt-1.5" />
                )}
              </div>
            );

            // Every notify() call site in the codebase sets engagementId —
            // runId is the more specific destination when present (goes
            // straight to the run that failed/timed out), engagementId is
            // the fallback every other type actually has (credential
            // issues, weekly metrics, lost-deal sweeps, audit delivery
            // failures, objection alerts). Previously only runId was ever
            // used, so most notification types had nowhere to click
            // through to at all — fixed here rather than only documented.
            const href = n.runId ? `/dashboard/runs/${n.runId}` : n.engagementId ? `/dashboard/engagements/${n.engagementId}` : null;

            return href ? (
              <Link
                key={n.id}
                href={href}
                onClick={() => {
                  if (!n.read) markRead(n.id);
                  onNavigate?.();
                }}
                className="block"
              >
                {content}
              </Link>
            ) : (
              <button
                key={n.id}
                onClick={() => !n.read && markRead(n.id)}
                className="w-full text-left cursor-pointer block"
              >
                {content}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Small re-export so any other call site that just wants the bell glyph
 * itself (no dropdown) doesn't need to reach into right-utility-rail.tsx. */
export { Bell as NotificationBellIcon };
