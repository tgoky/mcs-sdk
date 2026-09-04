"use client";

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
    <div className="w-48 shrink-0 flex flex-col rounded-xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-white/30 dark:bg-zinc-950/30 backdrop-blur-md shadow-xs">
      <button
        type="button"
        onClick={onNewChat}
        className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium border-b border-zinc-200/80 dark:border-zinc-800/80 text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer hover:bg-zinc-100/50 dark:hover:bg-zinc-900/50"
      >
        <Plus size={13} className="text-zinc-500 dark:text-zinc-400" />
        <span>New conversation</span>
      </button>

      <div className="relative flex-1 min-h-0 overflow-y-auto p-1 flex flex-col gap-0.5">
        {indicator && (
          <div
            aria-hidden="true"
            className="absolute left-1 right-1 rounded-lg bg-zinc-200/70 dark:bg-zinc-800/70 transition-[transform,height] duration-150 ease-out"
            style={{ height: indicator.height, transform: `translateY(${indicator.top}px)` }}
          />
        )}
        {threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-6 px-2 text-center text-zinc-400 dark:text-zinc-500">
            <MessagesSquare size={14} />
            <p className="text-[10px]">No conversations yet</p>
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
                className={`relative z-10 flex items-center justify-between gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors cursor-pointer hover:bg-zinc-100/40 dark:hover:bg-zinc-900/40 ${
                  active
                    ? "text-zinc-900 dark:text-zinc-100 font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 font-normal"
                }`}
              >
                <span className="truncate">{thread.title}</span>
                <span className="shrink-0 text-[9px] font-mono text-zinc-400 dark:text-zinc-500">
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