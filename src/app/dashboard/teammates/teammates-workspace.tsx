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
import { useEffect, useState } from "react";
import { TeammatesChat, readStoredThreadId } from "./teammates-chat";
import { TeammatesThreadRail, type ThreadSummary } from "./teammates-thread-rail";

export function TeammatesWorkspace({ initialThreads }: { initialThreads: ThreadSummary[] }) {
  const [threads, setThreads] = useState(initialThreads);
  const [selected, setSelected] = useState<string | null>(() => readStoredThreadId());
  const [epoch, setEpoch] = useState(0);

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
    <div className="flex h-full min-h-0 gap-3">
      <TeammatesThreadRail threads={threads} selectedId={selected} onSelect={selectThread} onNewChat={startNewChat} />
      <div className="flex-1 min-h-0 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <TeammatesChat key={epoch} initialThreadId={selected} onThreadEvent={handleThreadEvent} initialPendingMessage={epoch === 0 ? pendingMessage : undefined} />
      </div>
    </div>
  );
}
