// src/components/booking-sync-chip.tsx
"use client";

import { BookingSyncStatus } from "@/lib/booking-sync-status";
import { Clock } from "lucide-react";

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Stripped to just a filled clock + relative time — no pill bg/border, no
// headline copy ("Auto-polling · instant sync available" etc.) cluttering
// the page header. The full headline + detail still exist and aren't
// silently dropped — they're on the title tooltip — and health still
// reads through the icon's color (a real error still shows red).
export function BookingSyncChip({ status }: { status: BookingSyncStatus }) {
  if (!status.platform || status.mode === "none") return null;

  const timeLabel = relativeTime(status.lastActivityAt);
  const toneClass =
    status.health === "healthy"
      ? "text-emerald-600 dark:text-emerald-400 fill-emerald-600/20 dark:fill-emerald-400/20"
      : status.health === "error"
      ? "text-rose-600 dark:text-rose-400 fill-rose-600/20 dark:fill-rose-400/20"
      : "text-sky-600 dark:text-sky-400 fill-sky-600/20 dark:fill-sky-400/20";

  return (
    <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-medium" title={`${status.headline} — ${status.detail}`}>
      <Clock className={`w-3.5 h-3.5 shrink-0 ${toneClass}`} />
      {timeLabel && <span className={status.health === "healthy" ? "text-emerald-700 dark:text-emerald-300" : status.health === "error" ? "text-rose-700 dark:text-rose-300" : "text-sky-700 dark:text-sky-300"}>{timeLabel}</span>}
    </div>
  );
}