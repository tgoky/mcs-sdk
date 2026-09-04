"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  X,
  AtSign,
} from "lucide-react";
import { PrefillLoader } from "@/components/prefill-loader";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";

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
    token: "pin-down",
    label: "Pin-Down",
    pillStyle: "bg-amber-400/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  {
    token: "pile-on",
    label: "Pile-On",
    pillStyle: "bg-purple-400/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  },
  {
    token: "pre-call-read",
    label: "Pre-Call Read",
    pillStyle: "bg-pink-400/15 text-pink-700 dark:text-pink-300 border-pink-500/30",
  },
  {
    token: "win-back",
    label: "Win-Back",
    pillStyle: "bg-rose-400/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
  {
    token: "leak-map",
    label: "Leak Map",
    pillStyle: "bg-sky-400/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  },
];

function FormattedMessage({ content }: { content: string }) {
  const parts = content.split(/(@[\w-]+)/g);
  return (
    <span className="whitespace-pre-wrap leading-relaxed">
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          const token = part.slice(1);
          const skill = MENTIONABLE_SKILLS.find((s) => s.token === token);
          if (skill) {
            return (
              <span
                key={i}
                className={`inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded-full text-[11px] font-medium border ${skill.pillStyle}`}
              >
                <SquishySkillBadge skill={skill.token} size={14} />
                <span>{skill.label}</span>
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

  const dropdownItems: DropdownItem[] = MENTIONABLE_SKILLS.map((s) => ({
    key: s.token,
    label: s.label,
  }));

  return (
    <div className="flex flex-col h-full text-zinc-900 dark:text-zinc-100">
      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-xs">
        {historyLoading && (
          <div className="flex items-center gap-2 px-1 text-zinc-500">
            <PrefillLoader size={12} />
            <span className="text-xs">Loading conversation...</span>
          </div>
        )}

        {!historyLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-1.5 px-4 py-8">
            <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Ask Workers to run something
            </p>
            <p className="text-[11px] leading-relaxed max-w-[240px] text-zinc-500">
              Try &quot;run a call brief for Acme Co&quot; or use @ to tag a skill.
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
            <div className="flex items-center gap-1.5 px-1 text-[10px] font-medium text-zinc-500">
              {m.role === "assistant" ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
                  <span>Assistant</span>
                </>
              ) : (
                <>
                  <span>You</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 dark:bg-zinc-400" />
                </>
              )}
            </div>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs border ${
                m.role === "user"
                  ? "bg-zinc-900 dark:bg-zinc-800 text-zinc-100 border-zinc-800 dark:border-zinc-700/80"
                  : "bg-white/80 dark:bg-zinc-900/80 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <FormattedMessage content={m.content} />
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="mt-2 space-y-1 pt-1.5 border-t border-zinc-200 dark:border-zinc-800">
                  {m.toolCalls.map((tc, j) => (
                    <div key={j} className="flex items-start gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                      {tc.ok ? (
                        <CheckCircle2 size={10} className="text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle size={10} className="text-rose-500 shrink-0 mt-0.5" />
                      )}
                      <span>{tc.message}</span>
                    </div>
                  ))}
                </div>
              )}
              {m.links && m.links.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 pt-1.5 border-t border-zinc-200 dark:border-zinc-800">
                  {m.links.map((link, j) => (
                    <a
                      key={j}
                      href={link.href}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors border border-zinc-200 dark:border-zinc-700/60"
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
            <PrefillLoader size={12} />
            <span className="text-xs">Working on it...</span>
          </div>
        )}

        {error && <p className="text-xs text-rose-500 px-1">{error}</p>}
      </div>

      {/* Multi-line Input Box */}
      <div className="relative p-2 border-t border-zinc-200/80 dark:border-zinc-800/80 bg-white/40 dark:bg-zinc-950/40 backdrop-blur-md">
        {/* Upward Autocomplete Menu */}
        {showMentions && (
          <div className="absolute bottom-full left-2 mb-2 w-52 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden z-50">
            {filteredMentions.map((s) => (
              <button
                key={s.token}
                type="button"
                onClick={() => addSkillTag(s.token)}
                className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
              >
                <SquishySkillBadge skill={s.token} size={16} />
                <span>@{s.token}</span>
              </button>
            ))}
          </div>
        )}

        {/* Outer Card Container */}
        <div className="flex flex-col gap-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2.5 shadow-2xs focus-within:border-zinc-400 dark:focus-within:border-zinc-700 transition-colors">
          {/* Tagged Skills & Textarea */}
          <div className="flex flex-col gap-1.5">
            {taggedSkills.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-zinc-100 dark:border-zinc-800/60">
                {taggedSkills.map((token) => {
                  const skill = MENTIONABLE_SKILLS.find((s) => s.token === token);
                  if (!skill) return null;
                  return (
                    <span
                      key={token}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${skill.pillStyle} shrink-0`}
                    >
                      <SquishySkillBadge skill={skill.token} size={14} />
                      <span>{skill.label}</span>
                      <button
                        type="button"
                        onClick={() => removeSkillTag(token)}
                        className="hover:opacity-80 transition-opacity cursor-pointer ml-0.5"
                      >
                        <X size={11} />
                      </button>
                    </span>
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
              placeholder={taggedSkills.length > 0 ? "add details..." : "Ask Workers or type @..."}
              rows={Math.min(6, Math.max(1, input.split("\n").length))}
              className="w-full min-h-[28px] max-h-36 resize-none bg-transparent text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none leading-relaxed overflow-y-auto"
            />
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center justify-between pt-1">
            <Dropdown
              variant="icon"
              icon={AtSign}
              triggerTitle="Tag skill"
              align="left"
              items={dropdownItems}
              onSelect={(key) => addSkillTag(key)}
            />

            <button
              type="button"
              onClick={() => send()}
              disabled={loading || (!input.trim() && taggedSkills.length === 0)}
              className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-950 disabled:opacity-20 disabled:cursor-not-allowed hover:bg-black dark:hover:bg-white transition-all shadow-xs cursor-pointer shrink-0"
              aria-label="Send message"
            >
              <ArrowUp size={13} className="stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}