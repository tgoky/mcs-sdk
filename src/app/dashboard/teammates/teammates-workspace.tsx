"use client";

// src/app/dashboard/teammates/teammates-workspace.tsx
//
// Owns which thread is selected for the full /dashboard/teammates page.
// Deliberately plain client state, not a ?thread= searchParam the way
// reports/calendar drive their selection — those pages need a fresh
// server query per selection; here the thread list is already loaded in
// full up front, and TeammatesChat already fetches a selected thread's
// messages itself client-side (built that way in the persistence round).
// Routing selection through searchParams would add a real server round
// trip for zero benefit and reintroduce the exact felt-latency problem
// just fixed on Calendar (revalidate=0 page with nothing to paint until
// the round trip lands) — so this stays client-side on purpose.
//
// `selected` starts from the same localStorage "last active thread" read
// TeammatesChat itself falls back to (readStoredThreadId, exported from
// teammates-chat.tsx) so the rail's initial highlight and the chat pane's
// initial load agree from the first render, instead of two independent
// reads of the same key.
//
// `epoch` is the actual remount trigger, deliberately separate from
// `selected`. TeammatesChat only reads its `initialThreadId` prop once at
// mount (documented on that component) — remounting is how you tell it
// "load a different thread." That should happen when the RAIL causes the
// switch (selectThread / startNewChat), but NOT when onThreadEvent fires
// mid-conversation: that's this same running instance's own new-thread-id
// becoming known after its first send() — it already has the messages in
// its own state and doesn't need to reload anything. Keying off `selected`
// directly would remount it right at that moment and wipe the message
// list that was just built, replacing it with a flicker back through
// "Loading conversation…" for content already on screen. `selected` still
// updates in handleThreadEvent so the rail's highlight and list re-sort
// correctly — that update just doesn't carry a key bump with it.
//
// `railWidth` is a plain draggable-divider setup, same shape as
// shell-layout.tsx's right-utility-panel width state (lazy localStorage
// read, a handler that sets state + persists on every drag tick, no
// try/catch — matches that exact precedent, not teammates-chat.tsx's
// best-effort thread-id reads). No gap and no separate bordered box
// around either side anymore: the rail and TeammatesChat sit flush
// against each other, divided only by the draggable line rendered
// between them, matching how Claude's own chat sidebar and message pane
// are one continuous surface instead of two floating panels.
import { useCallback, useEffect, useRef, useState } from "react";
import { TeammatesChat, readStoredThreadId } from "./teammates-chat";
import { TeammatesThreadRail, type ThreadSummary } from "./teammates-thread-rail";

const RAIL_WIDTH_KEY = "mcs-teammates-rail-width";
const MIN_RAIL_WIDTH = 200;
const MAX_RAIL_WIDTH = 400;
const DEFAULT_RAIL_WIDTH = 260;

function readStoredRailWidth(): number {
  if (typeof window === "undefined") return DEFAULT_RAIL_WIDTH;
  const stored = window.localStorage.getItem(RAIL_WIDTH_KEY);
  const n = stored ? Number(stored) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, n)) : DEFAULT_RAIL_WIDTH;
}

export function TeammatesWorkspace({ initialThreads }: { initialThreads: ThreadSummary[] }) {
  const [threads, setThreads] = useState(initialThreads);
  const [selected, setSelected] = useState<string | null>(() => readStoredThreadId());
  const [epoch, setEpoch] = useState(0);
  const [railWidth, setRailWidth] = useState(readStoredRailWidth);

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const handleRailWidthChange = useCallback((w: number) => {
    setRailWidth(w);
    window.localStorage.setItem(RAIL_WIDTH_KEY, String(w));
  }, []);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current || !containerRef.current) return;
      const left = containerRef.current.getBoundingClientRect().left;
      const next = Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, e.clientX - left));
      handleRailWidthChange(next);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [handleRailWidthChange]);

  // Landing back from a real Composio OAuth redirect (connect_credential's
  // link, chat-credentials.ts) — /dashboard/teammates is on the return
  // allowlist and the callback appends ?composio_connected=<provider>. The
  // thread this browser was last in is already `selected` above (same
  // localStorage read, no extra plumbing needed for that part) — this
  // only needs to turn the query param into one auto-sent message so the
  // model picks the conversation back up itself instead of the user
  // having to retype "I just connected X." No epoch bump: this continues
  // the current thread, it doesn't switch to a different one.
  const [pendingMessage] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const provider = new URLSearchParams(window.location.search).get("composio_connected");
    return provider ? `I just connected ${provider}.` : undefined;
  });

  useEffect(() => {
    if (!pendingMessage) return;
    // Strips the param so a refresh doesn't re-fire the same auto-send —
    // separated from the read above (a pure lazy initializer) since a
    // history mutation doesn't belong there.
    const url = new URL(window.location.href);
    url.searchParams.delete("composio_connected");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectThread(id: string) {
    // Re-clicking the already-active thread shouldn't reload it — that'd
    // just be a pointless remount + spinner for content already on screen.
    if (id === selected) return;
    setSelected(id);
    setEpoch((e) => e + 1);
  }

  function startNewChat() {
    // Same guard: clicking "New conversation" while already on a blank
    // one shouldn't wipe whatever's been typed but not sent yet.
    if (selected === null) return;
    setSelected(null);
    setEpoch((e) => e + 1);
  }

  function handleThreadEvent(thread: { id: string; title: string }) {
    setThreads((prev) => [{ id: thread.id, title: thread.title, lastMessageAt: new Date().toISOString() }, ...prev.filter((t) => t.id !== thread.id)]);
    setSelected(thread.id);
    // No setEpoch here — see file comment above.
  }

  return (
    <div ref={containerRef} className="relative flex h-full min-h-0">
      <div style={{ width: railWidth }} className="h-full min-h-0 shrink-0">
        <TeammatesThreadRail threads={threads} selectedId={selected} onSelect={selectThread} onNewChat={startNewChat} />
      </div>

      {/* The "single vertical line" divider — draggable, no boxed panels
         on either side of it. Wider invisible hit target than the visible
         line itself, same trick as right-utility-panel.tsx's own handle. */}
      <div onMouseDown={onDragStart} className="relative w-px shrink-0 cursor-col-resize group" title="Drag to resize">
        <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
        <div className="absolute inset-y-0 left-0 w-px bg-zinc-200 dark:bg-zinc-800 group-hover:bg-zinc-400 dark:group-hover:bg-zinc-600 transition-colors" />
      </div>

      <div className="flex-1 min-w-0 h-full min-h-0">
        <TeammatesChat
          key={epoch}
          initialThreadId={selected}
          onThreadEvent={handleThreadEvent}
          initialPendingMessage={epoch === 0 ? pendingMessage : undefined}
          size="full"
        />
      </div>
    </div>
  );
}
