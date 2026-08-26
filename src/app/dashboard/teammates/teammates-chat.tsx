"use client";

// src/app/dashboard/teammates/teammates-chat.tsx
//
// The actual chat UI, shared between the full /dashboard/teammates page
// and the compact right-utility-panel tab — same reuse pattern as every
// other feature this session (AutopilotTable, CalendarAgenda, etc).
//
// v1 scope, stated in the code same as everywhere else this session: two
// real tools (Call Brief, Leak Map — see route.ts's header comment for
// why only these two), no persistence (conversation resets on reload —
// the backend has no memory between requests, same as documented for
// Claude-in-artifacts), a minimal @ mention affordance that inserts a
// skill name into the input (the model decides which tool to call
// regardless — this is a typing convenience, not a hard trigger).

import { useRef, useState } from "react";
import { Send, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { PrefillLoader } from "@/components/prefill-loader";
import { PinnedSkillsBar } from "./pinned-skills-bar";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; ok: boolean; message: string }[];
}

export const MENTIONABLE_SKILLS = [
  { token: "call-brief", label: "Call Brief" },
  { token: "leak-map", label: "Leak Map" },
];

export function TeammatesChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setMentionQuery(null);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/teammates/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.map((m) => ({ role: m.role, content: m.content })) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.error === "string" ? data.error : "Something went wrong.");
        return;
      }
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "", toolCalls: data.toolCalls ?? [] }]);
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
        {messages.length === 0 && (
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
            onClick={send}
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
