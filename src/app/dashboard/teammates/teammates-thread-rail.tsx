"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Plus, MessagesSquare, Pencil, Trash2, Check, X } from "lucide-react";

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
  onRename,
  onDelete,
}: {
  threads: ThreadSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  /** Persists a user-driven rename (PATCH /api/teammates/threads/:id) —
   * separate from the auto-derived first-message title. */
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useLayoutEffect(() => {
    const el = selectedId ? rowRefs.current.get(selectedId) : null;
    setIndicator(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
  }, [selectedId, threads]);

  function startRename(thread: ThreadSummary) {
    setRenamingId(thread.id);
    setRenameValue(thread.title);
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) onRename(renamingId, renameValue.trim());
    setRenamingId(null);
  }

  function handleDelete(id: string) {
    if (window.confirm("Delete this conversation? This can't be undone.")) onDelete(id);
  }

  return (
    <div className="h-full flex flex-col p-2">
      <button
        type="button"
        onClick={onNewChat}
        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60 shrink-0 mb-2"
      >
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-200/70 dark:bg-zinc-800 shrink-0">
          <Plus size={14} className="text-zinc-600 dark:text-zinc-300" />
        </span>
        <span>New</span>
      </button>

      {threads.length > 0 && (
        <p className="px-2.5 pb-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">Recents</p>
      )}

      <div className="relative flex-1 min-h-0 overflow-y-auto pb-2 flex flex-col gap-0.5">
        {indicator && (
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 rounded-lg bg-zinc-200/70 dark:bg-zinc-800/70 transition-[transform,height] duration-150 ease-out"
            style={{ height: indicator.height, transform: `translateY(${indicator.top}px)` }}
          />
        )}

        {threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-8 px-2 text-center text-zinc-400 dark:text-zinc-500">
            <MessagesSquare size={16} />
            <p className="text-xs">No conversations yet</p>
          </div>
        ) : (
          threads.map((thread) => {
            const active = thread.id === selectedId;
            const isRenaming = renamingId === thread.id;
            if (isRenaming) {
              return (
                <div
                  key={thread.id}
                  className="relative z-10 flex items-center gap-1 rounded-lg px-2 py-1.5 bg-zinc-100/50 dark:bg-zinc-900/50"
                >
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="min-w-0 flex-1 rounded-md bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={commitRename}
                    className="shrink-0 p-1 rounded-md text-emerald-600 hover:bg-emerald-500/10 cursor-pointer"
                    title="Save"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingId(null)}
                    className="shrink-0 p-1 rounded-md text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer"
                    title="Cancel"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            }
            return (
              <div
                key={thread.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(thread.id, el);
                  else rowRefs.current.delete(thread.id);
                }}
                className="group relative z-10 flex items-center gap-1 rounded-lg pl-2.5 pr-1.5 py-2 transition-colors hover:bg-zinc-100/50 dark:hover:bg-zinc-900/50"
              >
                <button
                  type="button"
                  onClick={() => onSelect(thread.id)}
                  className={`min-w-0 flex-1 flex items-center justify-between gap-2 text-left text-sm cursor-pointer ${
                    active
                      ? "text-zinc-900 dark:text-zinc-100 font-semibold"
                      : "text-zinc-600 dark:text-zinc-400 font-normal"
                  }`}
                >
                  <span className="truncate">{thread.title}</span>
                  <span className="shrink-0 text-[11px] font-mono text-zinc-400 dark:text-zinc-500 group-hover:hidden">
                    {relativeTime(thread.lastMessageAt)}
                  </span>
                </button>
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => startRename(thread)}
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer"
                    title="Rename conversation"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(thread.id)}
                    className="p-1 rounded-md text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                    title="Delete conversation"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}