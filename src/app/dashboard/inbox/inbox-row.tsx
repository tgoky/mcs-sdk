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

function categoryMeta(type: string) {
  switch (type) {
    case "run_failed":
      return {
        label: "Execution Failed",
        icon: <XCircle size={15} className="text-white shrink-0" />,
        bg: "bg-rose-500",
        dotFill: "bg-rose-500",
      };
    case "run_timed_out":
      return {
        label: "Execution Timeout",
        icon: <Clock size={15} className="text-white shrink-0" />,
        bg: "bg-amber-500",
        dotFill: "bg-amber-500",
      };
    case "credential_invalid":
    case "credential_check_error":
      return {
        label: "Credential Alert",
        icon: <KeyRound size={15} className="text-white shrink-0" />,
        bg: "bg-amber-500",
        dotFill: "bg-amber-500",
      };
    case "lost_deal_swept":
      return {
        label: "Win-Back Activity",
        icon: <RotateCcw size={15} className="text-white shrink-0" />,
        bg: "bg-emerald-500",
        dotFill: "bg-emerald-500",
      };
    case "weekly_metrics":
      return {
        label: "Weekly Insight",
        icon: <BarChart3 size={15} className="text-white shrink-0" />,
        bg: "bg-sky-500",
        dotFill: "bg-sky-500",
      };
    case "conversation_intelligence_objection_found":
      return {
        label: "Call Intelligence",
        icon: <Radio size={15} className="text-white shrink-0" />,
        bg: "bg-sky-500",
        dotFill: "bg-sky-500",
      };
    default:
      return {
        label: "Notification",
        icon: <AlertTriangle size={15} className="text-white shrink-0" />,
        bg: "bg-zinc-600",
        dotFill: "bg-zinc-500",
      };
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function InboxRow(props: InboxRowProps) {
  const [read, setRead] = useState(props.read);
  const [, startTransition] = useTransition();

  const meta = categoryMeta(props.type);

  const href = props.runId
    ? `/dashboard/runs/${props.runId}`
    : props.engagementId
      ? `/dashboard/engagements/${props.engagementId}`
      : undefined;

  function markRead() {
    if (read) return;
    setRead(true);
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
      className={`group w-full flex items-center justify-between gap-4 py-3.5 px-2 border-b border-zinc-200 dark:border-zinc-800/80 transition-colors cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40 ${
        !read ? "bg-transparent" : "opacity-60 hover:opacity-100"
      }`}
    >
      {/* Icon & Body */}
      <div className="flex items-start gap-3.5 min-w-0 flex-1">
        <div
          className={`w-8 h-8 rounded-full ${meta.bg} flex items-center justify-center shrink-0 mt-0.5`}
        >
          {meta.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-medium">
            <span>{meta.label}</span>
            <span>·</span>
            <span>{relativeTime(props.createdAt)}</span>
            {props.buyer && (
              <>
                <span>·</span>
                <span className="font-semibold text-zinc-700 dark:text-zinc-300 truncate">
                  {props.buyer}
                </span>
              </>
            )}
          </div>

          <p
            className={`text-sm tracking-tight mt-0.5 leading-snug line-clamp-2 ${
              !read
                ? "font-semibold text-zinc-900 dark:text-zinc-100"
                : "font-normal text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {props.title}{" "}
            {props.body && (
              <span className="font-normal text-zinc-500 dark:text-zinc-400">
                — {props.body}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Unread Dot Indicator */}
      {!read && (
        <div className="shrink-0 pl-2">
          <div className={`w-2 h-2 rounded-full ${meta.dotFill}`} />
        </div>
      )}
    </div>
  );

  return href ? (
    <Link href={href} className="block w-full">
      {content}
    </Link>
  ) : (
    content
  );
}