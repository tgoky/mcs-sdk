"use client";

// src/app/dashboard/teammates/teammates-thread-rail.tsx
//
// Left rail of past conversations for the full /dashboard/teammates page
// only — not the compact right-utility-panel tab, which is too narrow for
// a third column. Same sliding-highlight technique as
// sidebar-nav-links.tsx (measure the selected row's real offsetTop/
// offsetHeight via useLayoutEffect, slide one shared indicator to it)
// adapted for button+state selection instead of Link+pathname, since
// switching threads here is instant client state, never a real navigation
// — see teammates-workspace.tsx's file comment for why that's the right
// call over a searchParams-driven page (the thread list is already
// loaded; only the selected thread's messages need fetching, and
// TeammatesChat already does that itself).
//
// Kept as its own component rather than a SidebarNavLinks variant so this
// round doesn't touch a component the primary Work/Engagements sidebars
// already depend on.

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
    <div
      className="w-56 shrink-0 flex flex-col rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
    >
      <button
        type="button"
        onClick={onNewChat}
        className="flex items-center gap-2 px-3 py-2.5 text-xs font-semibold border-b transition-colors cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900"
        style={{ borderColor: "var(--border)", color: "var(--text-prefill-accent)" }}
      >
        <Plus size={13} />
        New conversation
      </button>

      <div className="relative flex-1 min-h-0 overflow-y-auto p-1.5 flex flex-col gap-0.5">
        {indicator && (
          <div
            aria-hidden="true"
            className="absolute left-1.5 right-1.5 rounded-lg transition-[transform,height] duration-150 ease-out"
            style={{ height: indicator.height, transform: `translateY(${indicator.top}px)`, background: "var(--accent-dim)" }}
          />
        )}

        {threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 px-3 text-center">
            <MessagesSquare size={16} style={{ color: "var(--text-muted)" }} />
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
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
                className="relative z-10 flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900"
                style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)" }}
              >
                <span className={`truncate ${active ? "font-semibold" : "font-medium"}`}>{thread.title}</span>
                <span className="shrink-0 text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
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
