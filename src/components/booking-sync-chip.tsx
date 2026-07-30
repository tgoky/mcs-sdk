"use client";

import { CheckCircle2, AlertTriangle, AlertCircle, HelpCircle } from "lucide-react";
import type { BookingSyncStatus } from "@/lib/booking-sync-status";
import { bookingPlatformLabel } from "@/lib/copy";

const HEALTH_STYLES: Record<
  BookingSyncStatus["health"],
  { text: string; iconColor: string; bg: string; border: string; Icon: typeof CheckCircle2 }
> = {
  healthy: {
    text: "text-emerald-700 dark:text-emerald-400",
    iconColor: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
    border: "border-emerald-200/80 dark:border-emerald-900/40",
    Icon: CheckCircle2,
  },
  warning: {
    text: "text-sky-700 dark:text-sky-400",
    iconColor: "text-sky-500 dark:text-sky-400",
    bg: "bg-sky-50/60 dark:bg-sky-950/20",
    border: "border-sky-200/80 dark:border-sky-900/40",
    Icon: AlertTriangle,
  },
  error: {
    text: "text-rose-700 dark:text-rose-400",
    iconColor: "text-rose-500 dark:text-rose-400",
    bg: "bg-rose-50/60 dark:bg-rose-950/20",
    border: "border-rose-200/80 dark:border-rose-900/40",
    Icon: AlertCircle,
  },
  unconfigured: {
    text: "text-zinc-600 dark:text-zinc-400",
    iconColor: "text-zinc-400 dark:text-zinc-500",
    bg: "bg-zinc-100/80 dark:bg-zinc-900/40",
    border: "border-zinc-200 dark:border-zinc-800",
    Icon: HelpCircle,
  },
};

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "No activity yet";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

interface BookingSyncChipProps {
  status: BookingSyncStatus;
  className?: string;
}

export function BookingSyncChip({ status, className = "" }: BookingSyncChipProps) {
  if (!status.platform) return null;

  const styles = HEALTH_STYLES[status.health];
  const Icon = styles.Icon;
  const platformName = bookingPlatformLabel(status.platform);
  const timeAgo = formatRelativeTime(status.lastActivityAt);

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${styles.bg} ${styles.border} ${className}`}
    >
      <Icon size={14} className={`${styles.iconColor} shrink-0`} />
      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{platformName}</span>
      <span className="text-zinc-300 dark:text-zinc-700">•</span>
      <span className={styles.text}>{status.headline}</span>
      <span className="text-zinc-300 dark:text-zinc-700">•</span>
      <span className="text-zinc-500 dark:text-zinc-400 font-mono text-[11px]">{timeAgo}</span>
    </div>
  );
}