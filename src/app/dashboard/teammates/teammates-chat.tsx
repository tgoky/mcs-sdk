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
import { AnySkillBadge } from "@/components/any-skill-badge";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";

interface ChatMessage {
  role: "user" | "worker" | "assistant";
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
    pillStyle: "bg-amber-400/20 text-amber-700 dark:text-amber-300 border-amber-500/30 backdrop-blur-xs",
  },
  {
    token: "pile-on",
    label: "Pile-On",
    pillStyle: "bg-purple-400/20 text-purple-700 dark:text-purple-300 border-purple-500/30 backdrop-blur-xs",
  },
  {
    token: "pre-call-read",
    label: "Pre-Call Read",
    pillStyle: "bg-pink-400/20 text-pink-700 dark:text-pink-300 border-pink-500/30 backdrop-blur-xs",
  },
  {
    token: "win-back",
    label: "Win-Back",
    pillStyle: "bg-rose-400/20 text-rose-700 dark:text-rose-300 border-rose-500/30 backdrop-blur-xs",
  },
  {
    token: "leak-map",
    label: "Leak Map",
    pillStyle: "bg-sky-400/20 text-sky-700 dark:text-sky-300 border-sky-500/30 backdrop-blur-xs",
  },
  // Reputation Manager's 6 — distinct hues from the 5 above so a mention
  // pill's color alone tells you which product it's from.
  {
    token: "rep-onboarding",
    label: "Identity Setup",
    pillStyle: "bg-teal-400/20 text-teal-700 dark:text-teal-300 border-teal-500/30 backdrop-blur-xs",
  },
  {
    token: "rep-engine-panel",
    label: "AI Engine Watch",
    pillStyle: "bg-indigo-400/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 backdrop-blur-xs",
  },
  {
    token: "rep-trustpilot-watch",
    label: "Trustpilot Watch",
    pillStyle: "bg-lime-400/20 text-lime-700 dark:text-lime-300 border-lime-500/30 backdrop-blur-xs",
  },
  {
    token: "rep-reddit-watch",
    label: "Reddit Watch",
    pillStyle: "bg-orange-400/20 text-orange-700 dark:text-orange-300 border-orange-500/30 backdrop-blur-xs",
  },
  {
    token: "rep-twitter-watch",
    label: "Twitter/X Watch",
    pillStyle: "bg-fuchsia-400/20 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30 backdrop-blur-xs",
  },
  {
    token: "rep-crisis-response",
    label: "Crisis Response",
    pillStyle: "bg-red-400/20 text-red-700 dark:text-red-300 border-red-500/30 backdrop-blur-xs",
  },
];

function FormattedMessage({ content, mentionPillTextSize }: { content: string; mentionPillTextSize: string }) {
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
                className={`inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded-full font-medium border ${mentionPillTextSize} ${skill.pillStyle}`}
              >
                <AnySkillBadge skill={skill.token} size={14} />
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
  size = "compact",
}: {
  initialThreadId?: string | null;
  onThreadEvent?: (thread: { id: string; title: string }) => void;
  initialPendingMessage?: string;
  size?: "compact" | "full";
} = {}) {
  const isFull = size === "full";
  const textSize = isFull ? "text-sm" : "text-xs";
  const labelSize = isFull ? "text-xs" : "text-[10px]";
  const emptyTitleSize = isFull ? "text-base" : "text-xs";
  const emptySubSize = isFull ? "text-sm" : "text-[11px]";
  const emptyMaxWidth = isFull ? "max-w-[360px]" : "max-w-[240px]";
  const bubbleMaxWidth = isFull ? "max-w-[70%]" : "max-w-[85%]";
  const bubblePadding = isFull ? "px-4 py-3" : "px-3 py-2";
  const streamColumn = isFull ? "max-w-3xl mx-auto w-full" : "";
  const streamPadding = isFull ? "px-6 py-6 md:px-0" : "px-3 py-3";
  const streamGap = isFull ? "space-y-6" : "space-y-3";
  const toolLinkTextSize = isFull ? "text-xs" : "text-[10px]";
  const composerPadding = isFull ? "px-6 pb-6 pt-2 md:px-0" : "p-2.5";
  const composerColumn = isFull ? "max-w-3xl mx-auto w-full" : "";
  const inputCardPadding = isFull ? "p-3.5" : "p-2.5";
  const tagPillTextSize = isFull ? "text-sm" : "text-xs";
  const dropdownItemTextSize = isFull ? "text-sm" : "text-xs";
  const sendButtonSize = isFull ? "w-8 h-8" : "w-6 h-6";
  const sendIconSize = isFull ? 15 : 13;
  const dotSize = isFull ? "w-2 h-2" : "w-1.5 h-1.5";

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
          role: "worker",
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
    <div className="flex flex-col h-full text-zinc-900 dark:text-zinc-100 min-h-0">
      {/* Message Stream */}
      <div className={`flex-1 overflow-y-auto ${streamPadding} ${textSize}`}>
        <div className={`${streamColumn} min-h-full ${streamGap}`}>
          {historyLoading && (
            <div className="flex items-center gap-2 px-1 text-zinc-500">
              <PrefillLoader size={12} />
              <span className={textSize}>Loading conversation...</span>
            </div>
          )}

          {!historyLoading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-1.5 px-4 py-8">
              <p className={`${emptyTitleSize} font-bold text-zinc-900 dark:text-zinc-100 tracking-tight`}>
                Ask Workers to run something
              </p>
              <p className={`${emptySubSize} leading-relaxed ${emptyMaxWidth} text-zinc-500 dark:text-zinc-400`}>
                Try &quot;run a call brief for Acme Co&quot; or use @ to tag a skill.
              </p>
            </div>
          )}

          {messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div
                key={i}
                className={`flex flex-col space-y-1 ${
                  isUser ? "items-end" : "items-start"
                }`}
              >
                <div className={`flex items-center gap-1.5 px-1 font-medium text-zinc-500 dark:text-zinc-400 ${labelSize}`}>
                  {!isUser ? (
                    <>
                      <span className={`${dotSize} rounded-full bg-zinc-400 dark:bg-zinc-500`} />
                      <span>Worker</span>
                    </>
                  ) : (
                    <>
                      <span>You</span>
                      <span className={`${dotSize} rounded-full bg-zinc-600 dark:bg-zinc-400`} />
                    </>
                  )}
                </div>

                <div
                  className={`${bubbleMaxWidth} rounded-2xl ${bubblePadding} ${textSize} backdrop-blur-xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.25)] border transition-colors ${
                    isUser
                      ? "bg-zinc-900/90 dark:bg-zinc-800/80 text-zinc-100 border-white/10 dark:border-white/10"
                      : "bg-white/50 dark:bg-zinc-900/40 text-zinc-900 dark:text-zinc-100 border-white/60 dark:border-white/10"
                  }`}
                >
                  <FormattedMessage content={m.content} mentionPillTextSize={isFull ? "text-xs" : "text-[11px]"} />

                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="mt-2 space-y-1 pt-1.5 border-t border-zinc-200/50 dark:border-zinc-800/60">
                      {m.toolCalls.map((tc, j) => (
                        <div key={j} className={`flex items-start gap-1 text-zinc-500 dark:text-zinc-400 ${toolLinkTextSize}`}>
                          {tc.ok ? (
                            <CheckCircle2 size={isFull ? 12 : 10} className="text-emerald-500 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle size={isFull ? 12 : 10} className="text-rose-500 shrink-0 mt-0.5" />
                          )}
                          <span>{tc.message}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {m.links && m.links.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 pt-1.5 border-t border-zinc-200/50 dark:border-zinc-800/60">
                      {m.links.map((link, j) => (
                        <a
                          key={j}
                          href={link.href}
                          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold bg-white/60 dark:bg-zinc-800/60 backdrop-blur-xs hover:bg-white/80 dark:hover:bg-zinc-700/80 text-zinc-800 dark:text-zinc-200 transition-colors border border-white/40 dark:border-white/10 ${toolLinkTextSize}`}
                        >
                          {link.label}
                          <ArrowUpRight size={isFull ? 12 : 10} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-2 px-1 text-zinc-500">
              <PrefillLoader size={12} />
              <span className={textSize}>Working on it...</span>
            </div>
          )}

          {error && <p className={`text-rose-500 px-1 ${textSize}`}>{error}</p>}
        </div>
      </div>

      {/* Floating Composer Container (No full-bleed line or shelf background) */}
      <div className={`relative shrink-0 ${composerPadding}`}>
        <div className={composerColumn}>
          {showMentions && (
            <div className="absolute bottom-full left-2 mb-2 w-52 rounded-2xl bg-white/70 dark:bg-zinc-900/70 backdrop-blur-2xl border border-white/40 dark:border-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.5)] overflow-hidden z-50">
              {filteredMentions.map((s) => (
                <button
                  key={s.token}
                  type="button"
                  onClick={() => addSkillTag(s.token)}
                  className={`flex items-center gap-2 w-full text-left px-3 py-2 font-medium hover:bg-white/50 dark:hover:bg-white/10 text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer ${dropdownItemTextSize}`}
                >
                  <AnySkillBadge skill={s.token} size={16} />
                  <span>@{s.token}</span>
                </button>
              ))}
            </div>
          )}

          {/* Unified Floating Input Box */}
          <div className={`flex flex-col gap-2 rounded-2xl bg-zinc-900/40 dark:bg-zinc-900/60 backdrop-blur-xl border border-zinc-200/20 dark:border-zinc-800/80 ${inputCardPadding} shadow-lg focus-within:border-zinc-300/40 dark:focus-within:border-zinc-700 transition-all duration-200`}>
            <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
              {taggedSkills.map((token) => {
                const skill = MENTIONABLE_SKILLS.find((s) => s.token === token);
                if (!skill) return null;
                return (
                  <span
                    key={token}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium border ${tagPillTextSize} ${skill.pillStyle} shrink-0`}
                  >
                    <AnySkillBadge skill={skill.token} size={14} />
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
                rows={1}
                className={`flex-1 min-w-[140px] max-h-36 resize-none bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none leading-relaxed overflow-y-auto py-0.5 ${textSize}`}
              />
            </div>

            {/* Integrated Action Row (No border-t divider line) */}
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
                className={`flex items-center justify-center ${sendButtonSize} rounded-full bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-950 disabled:opacity-20 disabled:cursor-not-allowed hover:bg-black dark:hover:bg-white transition-all shadow-xs cursor-pointer shrink-0`}
                aria-label="Send message"
              >
                <ArrowUp size={sendIconSize} className="stroke-[2.5]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}