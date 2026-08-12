"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, XCircle, Clock, KeyRound, RotateCcw, BarChart3, Radio } from "lucide-react";

interface InboxRowProps {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  read: boolean;
  runId: string | null;
  engagementId: string | null;
  buyer: string | null;
  createdAt: string;
}

function iconFor(type: string) {
  if (type === "run_failed") return <XCircle size={16} className="text-rose-600 dark:text-rose-400 shrink-0" />;
  if (type === "run_timed_out") return <Clock size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />;
  if (type === "credential_invalid" || type === "credential_check_error")
    return <KeyRound size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />;
  if (type === "lost_deal_swept") return <RotateCcw size={16} className="text-sky-600 dark:text-sky-400 shrink-0" />;
  if (type === "weekly_metrics") return <BarChart3 size={16} className="text-sky-600 dark:text-sky-400 shrink-0" />;
  if (type === "conversation_intelligence_objection_found")
    return <Radio size={16} className="text-sky-600 dark:text-sky-400 shrink-0" />;
  return <AlertTriangle size={16} className="text-zinc-500 dark:text-zinc-400 shrink-0" />;
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

export function InboxRow(props: InboxRowProps) {
  const [read, setRead] = useState(props.read);
  const [isPending, startTransition] = useTransition();

  const href = props.runId
    ? `/dashboard/runs/${props.runId}`
    : props.engagementId
      ? `/dashboard/engagements/${props.engagementId}`
      : undefined;

  function markRead() {
    if (read) return;
    setRead(true); // optimistic — matches the bell's existing behavior
    startTransition(async () => {
      try {
        await fetch(`/api/notifications/${props.id}/read`, { method: "POST" });
      } catch {
        setRead(false);
      }
    });
  }

  const content = (
    <div
      onClick={markRead}
      className={`flex items-start gap-3 px-4 py-3 text-sm transition-colors cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/60 ${
        !read ? "bg-zinc-50/60 dark:bg-zinc-900/30" : ""
      }`}
    >
      <span className="mt-0.5">{iconFor(props.type)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`truncate ${!read ? "font-semibold text-zinc-900 dark:text-zinc-100" : "font-medium text-zinc-700 dark:text-zinc-300"}`}>
            {props.title}
          </p>
          {!read && <span className="w-1.5 h-1.5 rounded-full bg-ink shrink-0" aria-label="Unread" />}
        </div>
        <p className="text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{props.body}</p>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400 dark:text-zinc-600 font-mono">
          {props.buyer && <span>{props.buyer}</span>}
          {props.buyer && <span>·</span>}
          <span>{relativeTime(props.createdAt)}</span>
        </div>
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}
