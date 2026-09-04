"use client";

// src/app/dashboard/teammates/teammates-chat.tsx

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  AtSign,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  FileText,
  Zap,
  X,
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
      "bg-zinc-800 text-zinc-200 border-zinc-700/80 hover:bg-zinc-700/80",
  },
  {
    token: "leak-map",
    label: "Leak Map",
    icon: Zap,
    badgeStyle:
      "bg-zinc-800 text-zinc-200 border-zinc-700/80 hover:bg-zinc-700/80",
  },
];

/** Parses raw message text to convert @skill tags into monochrome chips in chat bubbles */
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
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 mx-0.5 rounded-md text-[11px] font-semibold border ${skill.badgeStyle}`}
              >
                <Icon size={11} className="shrink-0 text-zinc-400" />
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
  const [taggedSkills, setTaggedSkills] = useState<string[]>([]);
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

  function addSkillTag(token: string) {
    if (!taggedSkills.includes(token)) {
      setTaggedSkills((prev) => [...prev, token]);
    }
    setInput((prev) => prev.replace(/@(\w*)$/, ""));
    setMentionQuery(null);
    inputRef.current?.focus();
  }

  function removeSkillTag(token: string) {
    setTaggedSkills((prev) => prev.filter((t) => t !== token));
  }

  async function send(overrideText?: string) {
    const baseText = (overrideText ?? input).trim();
    if (!baseText && taggedSkills.length === 0) return;
    if (loading) return;

    const fullText = [
      ...taggedSkills.map((t) => `@${t}`),
      baseText,
    ].filter(Boolean).join(" ");

    setMessages((prev) => [...prev, { role: "user", content: fullText }]);
    if (overrideText === undefined) {
      setInput("");
      setTaggedSkills([]);
    }
    setMentionQuery(null);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/teammates/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message: fullText }),
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
    <div className="flex flex-col h-full bg-black text-zinc-100">
      <PinnedSkillsBar onSelect={addSkillTag} />

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {historyLoading && (
          <div className="flex items-center gap-2 px-1 text-zinc-500">
            <PrefillLoader size={14} />
            <span className="text-xs">Loading conversation...</span>
          </div>
        )}

        {!historyLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-4 py-12">
      
            <p className="text-sm font-bold text-zinc-100 tracking-tight">
              Ask Teammates to run something
            </p>
            <p className="text-xs leading-relaxed max-w-[260px] text-zinc-500">
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
            <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-zinc-500">
              {m.role === "assistant" ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-zinc-400" />
  
                </>
              ) : (
                <>
                  <span>You</span>
                  <span className="w-2 h-2 rounded-full bg-zinc-600" />
                </>
              )}
            </div>

            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs ${
                m.role === "user"
                  ? "bg-zinc-800 text-zinc-100 border border-zinc-700/80 rounded-tr-xs"
                  : "bg-zinc-900/90 text-zinc-100 border border-zinc-800 rounded-tl-xs"
              }`}
            >
              <FormattedMessage content={m.content} />

              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="mt-2.5 space-y-1 pt-2 border-t border-zinc-800">
                  {m.toolCalls.map((tc, j) => (
                    <div key={j} className="flex items-start gap-1.5 text-[10px] text-zinc-400">
                      {tc.ok ? (
                        <CheckCircle2 size={11} className="text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle size={11} className="text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <span>{tc.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {m.links && m.links.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 pt-2 border-t border-zinc-800">
                  {m.links.map((link, j) => (
                    <a
                      key={j}
                      href={link.href}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors border border-zinc-700/60"
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
          <div className="flex items-center gap-2 px-1 text-zinc-500">
            <PrefillLoader size={14} />
            <span className="text-xs">Working on it...</span>
          </div>
        )}

        {error && <p className="text-xs text-rose-400 px-1">{error}</p>}
      </div>

      {/* Prominently Delineated Floating Prompt Input Surface */}
      <div className="p-3 bg-black">
        <div className="relative rounded-2xl bg-[#121212] border border-zinc-800/90 p-3 shadow-2xl transition-all focus-within:border-zinc-600 focus-within:ring-1 focus-within:ring-zinc-700">
          {/* Active Skill Chips Container */}
          {taggedSkills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2 pb-2 border-b border-zinc-800/80">
              {taggedSkills.map((token) => {
                const skill = MENTIONABLE_SKILLS.find((s) => s.token === token);
                if (!skill) return null;
                const Icon = skill.icon;
                return (
                  <span
                    key={token}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${skill.badgeStyle}`}
                  >
                    <Icon size={12} className="text-zinc-400" />
                    <span>{skill.label}</span>
                    <button
                      type="button"
                      onClick={() => removeSkillTag(token)}
                      className="ml-1 text-zinc-400 hover:text-zinc-100 cursor-pointer"
                    >
                      <X size={11} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Autocomplete Dropdown Menu */}
          {showMentions && (
            <div className="absolute bottom-full left-0 mb-2 w-52 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden z-20">
              {filteredMentions.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.token}
                    type="button"
                    onClick={() => addSkillTag(s.token)}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs font-medium hover:bg-zinc-800 text-zinc-200 transition-colors"
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
            placeholder={taggedSkills.length > 0 ? "Add details..." : "Ask Teammates..."}
            rows={2}
            className="w-full resize-none bg-transparent text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />

          {/* Card Control Toolbar */}
          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleInputChange(`${input}@`)}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                title="Tag skill (@)"
              >
                <AtSign size={13} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-zinc-500 hidden sm:inline">
                Teammates AI
              </span>
              <button
                type="button"
                onClick={() => send()}
                disabled={loading || (!input.trim() && taggedSkills.length === 0)}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-100 text-zinc-950 disabled:opacity-20 disabled:cursor-not-allowed hover:bg-white transition-all shadow-xs cursor-pointer"
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