"use client";

// src/app/dashboard/teammates/teammates-thread-rail.tsx

import { useLayoutEffect, useRef, useState } from "react";
import { Plus, MessagesSquare } from "lucide-react";

export interface ThreadSummary {
  id: string;
  title: string;
  lastMessageAt: string;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function TeammatesThreadRail({
  threads,
  selectedId,
  onSelect,
  onNewChat,
}: {
  threads: ThreadSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}) {
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = selectedId ? rowRefs.current.get(selectedId) : null;
    setIndicator(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
  }, [selectedId, threads]);

  return (
    <div className="w-56 shrink-0 flex flex-col rounded-2xl overflow-hidden bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs transition-all">
      {/* Sleek Action Button Header */}
      <div className="p-2 border-b border-zinc-200/60 dark:border-zinc-800/60">
        <button
          type="button"
          onClick={onNewChat}
          className="flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-xl text-xs font-semibold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 active:scale-[0.98] transition-all shadow-2xs cursor-pointer"
        >
          <Plus size={14} className="stroke-[2.5]" />
          <span>New conversation</span>
        </button>
      </div>

      {/* Thread List */}
      <div className="relative flex-1 min-h-0 overflow-y-auto p-1.5 flex flex-col gap-0.5">
        {/* Animated Active Pill Indicator */}
        {indicator && (
          <div
            aria-hidden="true"
            className="absolute left-1.5 right-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 shadow-2xs transition-[transform,height] duration-200 ease-out"
            style={{
              height: indicator.height,
              transform: `translateY(${indicator.top}px)`,
            }}
          />
        )}

        {threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 px-3 text-center">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800/60 text-zinc-400">
              <MessagesSquare size={15} />
            </div>
            <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
              No conversations yet
            </p>
          </div>
        ) : (
          threads.map((thread) => {
            const active = thread.id === selectedId;
            return (
              <button
                key={thread.id}
                type="button"
                ref={(el) => {
                  if (el) rowRefs.current.set(thread.id, el);
                  else rowRefs.current.delete(thread.id);
                }}
                onClick={() => onSelect(thread.id)}
                className={`relative z-10 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                  active
                    ? "text-zinc-900 dark:text-zinc-100 font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                <span className="truncate flex-1">{thread.title}</span>
                <span className="shrink-0 text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                  {relativeTime(thread.lastMessageAt)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}