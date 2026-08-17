// src/components/booking-sync-chip.tsx
"use client";

import { BookingSyncStatus } from "@/lib/booking-sync-status";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(minutes / 24);
  return `${days}d ago`;
}

export function BookingSyncChip({ status }: { status: BookingSyncStatus }) {
  if (!status.platform || status.mode === "none") return null;

  const timeLabel = relativeTime(status.lastActivityAt);

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono font-medium transition-colors ${
        status.health === "healthy"
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
          : status.health === "error"
          ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
          : "bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400"
      }`}
    >
      {status.health === "healthy" && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
      {status.health === "error" && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
      {status.health === "warning" && <Clock className="w-3.5 h-3.5 shrink-0" />}

      <span>{status.headline}</span>

      {timeLabel && (
        <>
          <span className="opacity-40">·</span>
          <span className="opacity-80">{timeLabel}</span>
        </>
      )}
    </div>
  );
}