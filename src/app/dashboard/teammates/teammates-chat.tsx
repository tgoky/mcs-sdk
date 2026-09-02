"use client";

// src/app/dashboard/teammates/teammates-chat.tsx
//
// The actual chat UI, shared between the full /dashboard/teammates page
// and the compact right-utility-panel tab — same reuse pattern as every
// other feature this session (AutopilotTable, CalendarAgenda, etc).
//
// v1 scope, stated in the code same as everywhere else this session: two
// real tools (Call Brief, Leak Map — see route.ts's header comment for
// why only these two), a minimal @ mention affordance that inserts a
// skill name into the input (the model decides which tool to call
// regardless — this is a typing convenience, not a hard trigger).
//
// Persistence added 2026-08-30: the active threadId is kept in
// localStorage, same personal-per-browser convention as
// usePinnedSkills/right-utility-panel's persisted width — it's "which
// conversation this browser was last in," not account data. On mount,
// a stored threadId is used to reload that thread's messages from the
// server; a missing/expired one just starts blank, same as before this
// round. Successful tool calls can also return `links` — real page
// hrefs — rendered as clickable chips under the bubble.

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, CheckCircle2, XCircle, ArrowUpRight } from "lucide-react";
import { PrefillLoader } from "@/components/prefill-loader";
import { PinnedSkillsBar } from "./pinned-skills-bar";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; ok: boolean; message: string }[];
  links?: { label: string; href: string }[];
}

const THREAD_STORAGE_KEY = "mcs-teammates-active-thread-id";

// Exported for teammates-workspace.tsx: the full page resolves the same
// "last active thread" default once, up front, so the rail's initial
// highlight and this component's initial load agree without two
// independent localStorage reads racing or drifting.
export function readStoredThreadId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(THREAD_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredThreadId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(THREAD_STORAGE_KEY, id);
    else window.localStorage.removeItem(THREAD_STORAGE_KEY);
  } catch {
    // Best-effort, same as usePinnedSkills — an in-memory-only thread id
    // for this session beats throwing.
  }
}

export const MENTIONABLE_SKILLS = [
  { token: "call-brief", label: "Call Brief" },
  { token: "leak-map", label: "Leak Map" },
];

export function TeammatesChat({
  initialThreadId,
  onThreadEvent,
  initialPendingMessage,
}: {
  /**
   * Which thread this instance loads on mount. Omitted (the compact
   * right-utility-panel usage, via teammates-panel-content.tsx) falls
   * back to the existing localStorage "last active thread" convention,
   * unchanged. Provided (the full page, via teammates-workspace.tsx) —
   * a real id loads that thread, `null` skips loading entirely for a
   * blank "new conversation." The workspace forces a remount via `key`
   * whenever this should change, same pattern calendar-view.tsx already
   * uses for `key={period}` — so it's correct for this to be read once
   * at mount and never treated as reactive.
   */
  initialThreadId?: string | null;
  /**
   * Fired once a thread identity is known for this instance: a brand new
   * thread gets created (first message of a blank conversation) or an
   * existing one takes a new turn. Lets the rail add/re-sort its list
   * without a refetch. Not called in the compact-panel usage (no rail to
   * update there).
   */
  onThreadEvent?: (thread: { id: string; title: string }) => void;
  /**
   * A message to send automatically, once, right after mount — read once
   * the same way initialThreadId is, never treated as reactive. Built for
   * exactly one caller: teammates-workspace.tsx, landing back from a
   * Composio OAuth redirect, telling the assistant a platform just got
   * connected so it can pick the conversation back up on its own rather
   * than the user having to retype it. Omitted everywhere else.
   */
  initialPendingMessage?: string;
} = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState<boolean>(
    () => (initialThreadId !== undefined ? initialThreadId : readStoredThreadId()) !== null
  );
  const [error, setError] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(() =>
    initialThreadId !== undefined ? initialThreadId : readStoredThreadId()
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // initialThreadId is read directly here (not via the `threadId` state
    // var) so this effect has no reactive dependency and legitimately
    // only runs once on mount — same reasoning the original localStorage-
    // only version already documented, extended to the controlled case.
    const id = initialThreadId !== undefined ? initialThreadId : readStoredThreadId();
    let cancelled = false;

    // Deliberately sequenced after history load resolves (or immediately,
    // in the no-history branch below) rather than fired in parallel with
    // it. Firing it in parallel raced the two: if the history fetch
    // resolved after the auto-send's own optimistic append, its
    // setMessages(data.messages) would wholesale replace the array and
    // silently drop the just-added pending message from view (still
    // persisted server-side, just invisible until a manual reload).
    function sendPendingMessageIfAny() {
      if (initialPendingMessage) send(initialPendingMessage);
    }

    if (!id) {
      sendPendingMessageIfAny();
      return;
    }

    fetch(`/api/teammates/threads/${id}`)
      .then((r) => {
        if (r.status === 404) {
          // Stale thread id (e.g. DB reset) — same as never having had
          // one, not an error to surface. Only clears localStorage in the
          // uncontrolled case; a controlled (rail-driven) id going stale
          // is the workspace's list to correct, not this instance's.
          if (initialThreadId === undefined) writeStoredThreadId(null);
          if (!cancelled) setThreadId(null);
          return null;
        }
        if (!r.ok) throw new Error("Failed to load conversation");
        return r.json();
      })
      .then((data) => {
        if (!cancelled && data?.messages) setMessages(data.messages);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't reload the conversation.");
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
        if (!cancelled) sendPendingMessageIfAny();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleInputChange(value: string) {
    setInput(value);
    // Tracks an in-progress "@partial" at the cursor's end, not just
    // "was @ the very last character typed" — that naive version hid the
    // dropdown the instant a user typed anything to filter it, which
    // defeats the point of a mention list once there's more than a
    // couple of options.
    const match = value.match(/@(\w*)$/);
    setMentionQuery(match ? match[1] : null);
  }

  const filteredMentions =
    mentionQuery === null ? [] : MENTIONABLE_SKILLS.filter((s) => s.token.toLowerCase().startsWith(mentionQuery.toLowerCase()));
  const showMentions = mentionQuery !== null && filteredMentions.length > 0;

  function insertMention(token: string) {
    setInput((prev) => prev.replace(/@(\w*)$/, `@${token} `));
    setMentionQuery(null);
    inputRef.current?.focus();
  }

  // Clicking a pinned chip isn't replacing a typed "@partial" the way the
  // dropdown's insertMention is — there's nothing to regex out, just
  // append the mention to whatever's already there.
  function appendMention(token: string) {
    setInput((prev) => (prev.trim().length > 0 ? `${prev.trimEnd()} @${token} ` : `@${token} `));
    inputRef.current?.focus();
  }

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    if (overrideText === undefined) setInput("");
    setMentionQuery(null);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/teammates/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.error === "string" ? data.error : "Something went wrong.");
        return;
      }
      const data = await res.json();
      // The route always returns a threadId — a fresh one the first time
      // this browser sends a message, the same one on every turn after.
      // localStorage is kept up to date regardless of controlled/
      // uncontrolled mode — it's still "last active thread for this
      // browser" for whenever the compact panel is opened next.
      if (data.threadId && data.threadId !== threadId) {
        setThreadId(data.threadId);
        writeStoredThreadId(data.threadId);
      }
      if (data.threadId && typeof data.title === "string") {
        onThreadEvent?.({ id: data.threadId, title: data.title });
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply ?? "", toolCalls: data.toolCalls ?? [], links: data.links ?? [] },
      ]);
    } catch {
      setError("Network error — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PinnedSkillsBar onSelect={appendMention} />
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {historyLoading && (
          <div className="flex items-center gap-2 px-1">
            <PrefillLoader size={14} />
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Loading conversation…
            </span>
          </div>
        )}
        {!historyLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-4">
            <span
              className="flex items-center justify-center w-9 h-9 rounded-full"
              style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
            >
              <Sparkles size={16} />
            </span>
            <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
              Ask Teammates to run something
            </p>
            <p className="text-[11px] leading-relaxed max-w-[220px]" style={{ color: "var(--text-muted)" }}>
              Try &quot;run a call brief for Acme Co&quot; — type @ to see what it can do right now.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed"
              style={
                m.role === "user"
                  ? { background: "var(--text-prefill-accent)", color: "white" }
                  : { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }
              }
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="mt-2 space-y-1 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                  {m.toolCalls.map((tc, j) => (
                    <div key={j} className="flex items-start gap-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {tc.ok ? (
                        <CheckCircle2 size={11} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle size={11} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <span>{tc.message}</span>
                    </div>
                  ))}
                </div>
              )}
              {m.links && m.links.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                  {m.links.map((link, j) => (
                    <a
                      key={j}
                      href={link.href}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors hover:opacity-80"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-prefill-accent)" }}
                    >
                      {link.label}
                      <ArrowUpRight size={10} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 px-1">
            <PrefillLoader size={14} />
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Working on it…
            </span>
          </div>
        )}
        {error && (
          <p className="text-[11px] px-1" style={{ color: "var(--error)" }}>
            {error}
          </p>
        )}
      </div>

      <div className="relative shrink-0 border-t p-2.5" style={{ borderColor: "var(--border)" }}>
        {showMentions && (
          <div
            className="absolute bottom-full left-2.5 mb-1 rounded-lg shadow-lg overflow-hidden z-10"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          >
            {filteredMentions.map((s) => (
              <button
                key={s.token}
                type="button"
                onClick={() => insertMention(s.token)}
                className="block w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                style={{ color: "var(--text-primary)" }}
              >
                @{s.token}
                <span className="ml-1.5 font-normal" style={{ color: "var(--text-muted)" }}>
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask Teammates…"
            rows={1}
            className="flex-1 resize-none rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            style={{ background: "var(--text-prefill-accent)" }}
            aria-label="Send"
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
