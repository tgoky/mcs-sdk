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
        icon: <XCircle size={18} className="text-white shrink-0" />,
        bg: "bg-rose-500",
        dotBorder: "border-rose-500",
        dotFill: "bg-rose-500",
      };
    case "run_timed_out":
      return {
        label: "Execution Timeout",
        icon: <Clock size={18} className="text-white shrink-0" />,
        bg: "bg-amber-500",
        dotBorder: "border-amber-500",
        dotFill: "bg-amber-500",
      };
    case "credential_invalid":
    case "credential_check_error":
      return {
        label: "Credential Alert",
        icon: <KeyRound size={18} className="text-white shrink-0" />,
        bg: "bg-amber-500",
        dotBorder: "border-amber-500",
        dotFill: "bg-amber-500",
      };
    case "lost_deal_swept":
      return {
        label: "Win-Back Activity",
        icon: <RotateCcw size={18} className="text-white shrink-0" />,
        bg: "bg-emerald-500",
        dotBorder: "border-emerald-500",
        dotFill: "bg-emerald-500",
      };
    case "weekly_metrics":
      return {
        label: "Weekly Insight",
        icon: <BarChart3 size={18} className="text-white shrink-0" />,
        bg: "bg-sky-500",
        dotBorder: "border-sky-500",
        dotFill: "bg-sky-500",
      };
    case "conversation_intelligence_objection_found":
      return {
        label: "Call Intelligence",
        icon: <Radio size={18} className="text-white shrink-0" />,
        bg: "bg-sky-500",
        dotBorder: "border-sky-500",
        dotFill: "bg-sky-500",
      };
    default:
      return {
        label: "Notification",
        icon: <AlertTriangle size={18} className="text-white shrink-0" />,
        bg: "bg-zinc-600",
        dotBorder: "border-zinc-500",
        dotFill: "bg-zinc-500",
      };
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} Minutes Ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "Hour" : "Hours"} Ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "Day" : "Days"} Ago`;
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
      className={`group w-full flex items-center justify-between gap-4 p-4 rounded-2xl border transition-all duration-150 cursor-pointer ${
        !read
          ? "bg-zinc-100/90 dark:bg-zinc-900/80 border-zinc-200/80 dark:border-zinc-800 shadow-2xs"
          : "bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200/40 dark:border-zinc-800/40 opacity-80 hover:opacity-100"
      } hover:bg-zinc-100 dark:hover:bg-zinc-900/90 hover:border-zinc-300 dark:hover:border-zinc-700/60`}
    >
      {/* Left Icon & Body */}
      <div className="flex items-start gap-3.5 min-w-0 flex-1">
        <div
          className={`w-10 h-10 rounded-full ${meta.bg} flex items-center justify-center shrink-0 shadow-xs mt-0.5`}
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
                ? "font-bold text-zinc-900 dark:text-zinc-100"
                : "font-normal text-zinc-700 dark:text-zinc-300"
            }`}
          >
            {props.title} {props.body && <span className="font-normal text-zinc-500 dark:text-zinc-400">— {props.body}</span>}
          </p>
        </div>
      </div>

      {/* Target Dot Indicator (Matching Screenshot) */}
      <div className="shrink-0 pl-2">
        <div
          className={`w-5 h-5 rounded-full border-2 ${meta.dotBorder} flex items-center justify-center transition-transform group-hover:scale-110`}
        >
          <div className={`w-2 h-2 rounded-full ${meta.dotFill}`} />
        </div>
      </div>
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