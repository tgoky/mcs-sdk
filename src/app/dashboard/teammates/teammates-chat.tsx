"use client";

// src/app/dashboard/teammates/teammates-chat.tsx

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  AtSign,
  Sparkles,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  FileText,
  Zap,
} from "lucide-react";
import { PrefillLoader } from "@/components/prefill-loader";
import { PinnedSkillsBar } from "./pinned-skills-bar";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; ok: boolean; message: string }[];
  links?: { label: string; href: string }[];
}

const THREAD_STORAGE_KEY = "mcs-teammates-active-thread-id";

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
    // Best-effort storage fallback
  }
}

export const MENTIONABLE_SKILLS = [
  {
    token: "call-brief",
    label: "Call Brief",
    icon: FileText,
    badgeStyle:
      "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200/60 dark:border-purple-800/50",
  },
  {
    token: "leak-map",
    label: "Leak Map",
    icon: Zap,
    badgeStyle:
      "bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border-teal-200/60 dark:border-teal-800/50",
  },
];

/** Renders colorful skill badges inside messages (matching the screenshot style) */
function FormattedMessage({ content }: { content: string }) {
  const parts = content.split(/(@[\w-]+)/g);

  return (
    <span className="whitespace-pre-wrap leading-relaxed">
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          const token = part.slice(1);
          const skill = MENTIONABLE_SKILLS.find((s) => s.token === token);
          if (skill) {
            const Icon = skill.icon;
            return (
              <span
                key={i}
                className={`inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded-md text-[11px] font-semibold border ${skill.badgeStyle}`}
              >
                <Icon size={11} className="shrink-0" />
                {skill.label}
              </span>
            );
          }
        }
        return part;
      })}
    </span>
  );
}

export function TeammatesChat({
  initialThreadId,
  onThreadEvent,
  initialPendingMessage,
}: {
  initialThreadId?: string | null;
  onThreadEvent?: (thread: { id: string; title: string }) => void;
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
    const id = initialThreadId !== undefined ? initialThreadId : readStoredThreadId();
    let cancelled = false;

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
  }, []);

  function handleInputChange(value: string) {
    setInput(value);
    const match = value.match(/@(\w*)$/);
    setMentionQuery(match ? match[1] : null);
  }

  const filteredMentions =
    mentionQuery === null
      ? []
      : MENTIONABLE_SKILLS.filter((s) => s.token.toLowerCase().startsWith(mentionQuery.toLowerCase()));
  const showMentions = mentionQuery !== null && filteredMentions.length > 0;

  function insertMention(token: string) {
    setInput((prev) => prev.replace(/@(\w*)$/, `@${token} `));
    setMentionQuery(null);
    inputRef.current?.focus();
  }

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

      if (data.threadId && data.threadId !== threadId) {
        setThreadId(data.threadId);
        writeStoredThreadId(data.threadId);
      }

      if (data.threadId && typeof data.title === "string") {
        onThreadEvent?.({ id: data.threadId, title: data.title });
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply ?? "",
          toolCalls: data.toolCalls ?? [],
          links: data.links ?? [],
        },
      ]);
    } catch {
      setError("Network error — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#fafafa] dark:bg-zinc-950">
      <PinnedSkillsBar onSelect={appendMention} />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {historyLoading && (
          <div className="flex items-center gap-2 px-1 text-zinc-400">
            <PrefillLoader size={14} />
            <span className="text-xs">Loading conversation...</span>
          </div>
        )}

        {!historyLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-4 py-8">
            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white shadow-sm">
              <Sparkles size={18} />
            </span>
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Ask Teammates to run something
            </p>
            <p className="text-xs leading-relaxed max-w-[240px] text-zinc-500 dark:text-zinc-400">
              Try &quot;run a call brief for Acme Co&quot; — type @ to see available skills.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex flex-col space-y-1 ${
              m.role === "user" ? "items-end" : "items-start"
            }`}
          >
            {/* Minimalist Avatar & Role Label */}
            <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
              {m.role === "assistant" ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500" />
                  <span>Teammates AI</span>
                </>
              ) : (
                <>
                  <span>You</span>
                  <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-amber-400 to-rose-400" />
                </>
              )}
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-2xs ${
                m.role === "user"
                  ? "bg-[#e8ebfd] dark:bg-indigo-950/70 text-indigo-950 dark:text-indigo-100 rounded-tr-xs"
                  : "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200/60 dark:border-zinc-800/80 rounded-tl-xs"
              }`}
            >
              <FormattedMessage content={m.content} />

              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="mt-2.5 space-y-1 pt-2 border-t border-zinc-200/50 dark:border-zinc-800">
                  {m.toolCalls.map((tc, j) => (
                    <div
                      key={j}
                      className="flex items-start gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400"
                    >
                      {tc.ok ? (
                        <CheckCircle2 size={11} className="text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle size={11} className="text-rose-500 shrink-0 mt-0.5" />
                      )}
                      <span>{tc.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {m.links && m.links.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 pt-2 border-t border-zinc-200/50 dark:border-zinc-800">
                  {m.links.map((link, j) => (
                    <a
                      key={j}
                      href={link.href}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-indigo-600 dark:text-indigo-400 transition-colors"
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
          <div className="flex items-center gap-2 px-1 text-zinc-400">
            <PrefillLoader size={14} />
            <span className="text-xs">Working on it...</span>
          </div>
        )}

        {error && <p className="text-xs text-rose-500 px-1">{error}</p>}
      </div>

      {/* Oreo-Style Floating Card Input */}
      <div className="p-3">
        <div className="relative rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 p-2.5 shadow-sm transition-all focus-within:border-zinc-300 dark:focus-within:border-zinc-700">
          {showMentions && (
            <div className="absolute bottom-full left-0 mb-2 w-48 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg overflow-hidden z-20">
              {filteredMentions.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.token}
                    type="button"
                    onClick={() => insertMention(s.token)}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition-colors"
                  >
                    <Icon size={13} className="text-zinc-400" />
                    <span>@{s.token}</span>
                  </button>
                );
              })}
            </div>
          )}

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
            placeholder="Ask Teammates..."
            rows={2}
            className="w-full resize-none bg-transparent text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none px-1"
          />

          {/* Bottom Control Bar */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleInputChange(`${input}@`)}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                title="Mention skill (@)"
              >
                <AtSign size={13} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-zinc-400 hidden sm:inline">
                Teammates AI
              </span>
              <button
                type="button"
                onClick={() => send()}
                disabled={loading || !input.trim()}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-all shadow-xs"
                aria-label="Send message"
              >
                <ArrowUp size={14} className="stroke-[2.5]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}