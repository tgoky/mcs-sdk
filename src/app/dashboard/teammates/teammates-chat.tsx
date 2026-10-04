"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  X,
  AtSign,
  Pencil,
  Check,
  ChevronLeft,
} from "lucide-react";
import { useTheme } from "next-themes";
import { PrefillLoader } from "@/components/prefill-loader";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { UserAvatar } from "@/components/user-avatar";
import { generateAvatarDataUri, DEFAULT_AVATAR_STYLE, WORKER_AVATAR_SEED } from "@/lib/avatar";
import type { UserAvatarPrefs } from "@/lib/user-avatar";
import { useInstalledSkillsContext } from "@/components/installed-skills-context";
import { allWorkers, type WorkerDefinition } from "@/lib/worker-registry";

const NO_AVATAR: UserAvatarPrefs = { avatarType: null, avatarStyle: null, avatarSeed: null, avatarImageUrl: null };

interface ChatMessage {
  role: "user" | "worker" | "assistant";
  content: string;
  toolCalls?: { name: string; ok: boolean; message: string }[];
  links?: { label: string; href: string }[];
  /** ISO timestamp — real, from the DB on reload (chat-threads.ts's
   * loadThreadForDisplay) or stamped at the moment a live message is
   * added (send/reply) below. Backs the date/time dividers between
   * messages, so it's always a genuine time, never a placeholder. */
  createdAt: string;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

/** "Jun 14, 2026 at 9:30 AM" — a divider between messages separated by a
 * real gap, the same convention iMessage uses instead of stamping every
 * bubble individually. */
function formatDivider(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const timePart = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${datePart} at ${timePart}`;
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

// Same 4-color product accent worker-card.tsx's own PRODUCT_ACCENT already
// uses (showtime/reputation-manager/cold-open/whop-agent), reused here
// instead of inventing a second palette — a mention pill's color still
// tells you which product it's from, just at the product level rather
// than a bespoke hue per individual skill (impractical to hand-author and
// keep in sync as the registry grows).
const PRODUCT_PILL_STYLE: Record<WorkerDefinition["productId"], string> = {
  showtime: "bg-amber-400/20 text-amber-700 dark:text-amber-300 border-amber-500/30 backdrop-blur-xs",
  "reputation-manager": "bg-indigo-400/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 backdrop-blur-xs",
  "cold-open": "bg-rose-400/20 text-rose-700 dark:text-rose-300 border-rose-500/30 backdrop-blur-xs",
  "whop-agent": "bg-sky-400/20 text-sky-700 dark:text-sky-300 border-sky-500/30 backdrop-blur-xs",
};

// Was a hand-maintained list of exactly Showtime's 5 + Reputation
// Manager's 6 — Cold Open and Whop Agent were never added, so those
// skills could never be @-mentioned, pinned (pinned-skills-bar.tsx reads
// this same list), or shown with a badge anywhere in Teammates at all,
// not a rendering gap. Derived from the real worker registry now, so a
// new skill in ANY product shows up here automatically. productId is
// kept on each entry (not just baked into pillStyle) so the @ picker
// below can group by it the same way worker-actions-menu.tsx's Compare
// flyout groups the Library's own skill list.
export const MENTIONABLE_SKILLS = allWorkers().map((w) => ({
  token: w.id,
  label: w.name,
  productId: w.productId,
  pillStyle: PRODUCT_PILL_STYLE[w.productId],
}));

const PRODUCT_GROUP_LABELS: Record<WorkerDefinition["productId"], string> = {
  showtime: "Showtime",
  "reputation-manager": "Reputation Manager",
  "cold-open": "Cold Open",
  "whop-agent": "Whop Agent",
};

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
  onRenamed,
  initialPendingMessage,
  size = "compact",
  onBack,
}: {
  initialThreadId?: string | null;
  onThreadEvent?: (thread: { id: string; title: string }) => void;
  /** Notifies a parent that owns its own thread list (teammates-workspace.tsx)
   * that this thread's title changed via the header edit here — a plain
   * state update on the parent's side, not a second PATCH; this
   * component already made the one real request. */
  onRenamed?: (id: string, title: string) => void;
  initialPendingMessage?: string;
  size?: "compact" | "full";
  /** Mobile-only "back to thread list" affordance (teammates-workspace.tsx's
   * two-pane layout collapses to one pane below `md`) — omitted entirely
   * when the caller has nowhere to go back to (the compact panel variant). */
  onBack?: () => void;
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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [taggedSkills, setTaggedSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState<boolean>(
    () => (initialThreadId !== undefined ? initialThreadId : readStoredThreadId()) !== null
  );
  const [error, setError] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  // The @ button's menu (typing "@" opens the same menu via mentionQuery).
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const installed = useInstalledSkillsContext();
  const [threadId, setThreadId] = useState<string | null>(() =>
    initialThreadId !== undefined ? initialThreadId : readStoredThreadId()
  );
  // Real conversation name for the header below — the same title the
  // rail shows (teammates-thread-rail.tsx), read from this thread's own
  // record rather than invented. "Workers" is the assistant's own
  // established name in this file (MENTIONABLE_SKILLS, the empty-state
  // copy), not a placeholder — the honest default before any thread
  // exists to have its own title yet.
  const [threadTitle, setThreadTitle] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // For the small pfp next to each "You" message row — fetched here
  // rather than threaded as a prop, since this component is instantiated
  // from three separate trees (teammates-workspace.tsx,
  // teammates-panel-content.tsx, enable-worker-modal.tsx) with no single
  // server-component ancestor to fetch it once and pass down.
  const [userAvatar, setUserAvatar] = useState<UserAvatarPrefs>(NO_AVATAR);
  const [identityFallback, setIdentityFallback] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/avatar")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setUserAvatar(data.avatar ?? NO_AVATAR);
        setIdentityFallback(typeof data.identityFallback === "string" ? data.identityFallback : "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const workerAvatarUri = useMemo(
    () => generateAvatarDataUri(DEFAULT_AVATAR_STYLE, WORKER_AVATAR_SEED, { isDark, size: 32, transparentBackground: true }),
    [isDark]
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
        if (!cancelled && typeof data?.title === "string") setThreadTitle(data.title);
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
    const next = match ? match[1] : null;
    setMentionQuery(next);
  }

  // Only skills switched on for the client, under products that are
  // actually installed (same rule as the Create menu). Outside the
  // dashboard shell there's no such context, so fall back to the registry.
  const availableSkills = useMemo(() => {
    if (!installed) return MENTIONABLE_SKILLS;
    const on = new Set(installed.skills.map((k) => k.id));
    const products = new Set(installed.products.map((pr) => pr.id));
    return MENTIONABLE_SKILLS.filter((sk) => on.has(sk.token) && products.has(sk.productId));
  }, [installed]);

  const filteredMentions = useMemo(
    () =>
      mentionQuery === null
        ? availableSkills
        : availableSkills.filter((sk) => sk.token.toLowerCase().startsWith(mentionQuery.toLowerCase())),
    [availableSkills, mentionQuery]
  );

  const showMentions = pickerOpen || mentionQuery === "" || (mentionQuery !== null && filteredMentions.length > 0);
  const groupedMentions = useMemo(() => {
    const groups = new Map<WorkerDefinition["productId"], typeof MENTIONABLE_SKILLS>();
    for (const sk of filteredMentions) {
      const list = groups.get(sk.productId) ?? [];
      list.push(sk);
      groups.set(sk.productId, list);
    }
    return Array.from(groups.entries());
  }, [filteredMentions]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  function addSkillTag(token: string) {
    if (!taggedSkills.includes(token)) {
      setTaggedSkills((prev) => [...prev, token]);
    }
    setInput((prev) => prev.replace(/@(\w*)$/, ""));
    setPickerOpen(false);
    setMentionQuery(null);
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

    setMessages((prev) => [...prev, { role: "user", content: fullText, createdAt: new Date().toISOString() }]);
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
        setThreadTitle(data.title);
        onThreadEvent?.({ id: data.threadId, title: data.title });
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "worker",
          content: data.reply ?? "",
          toolCalls: data.toolCalls ?? [],
          links: data.links ?? [],
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  const headerName = threadTitle ?? "Workers";

  function startEditingTitle() {
    if (!threadId) return; // nothing persisted yet to rename
    setTitleDraft(headerName);
    setIsEditingTitle(true);
  }

  async function commitTitleEdit() {
    setIsEditingTitle(false);
    const nextTitle = titleDraft.trim();
    if (!threadId || !nextTitle || nextTitle === threadTitle) return;
    setThreadTitle(nextTitle);
    onRenamed?.(threadId, nextTitle);
    try {
      await fetch(`/api/teammates/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
    } catch {
      // Best-effort — the header already shows the new title; a failed
      // PATCH just means a future reload reverts it, same as any other
      // optimistic update in this file.
    }
  }

  return (
    <div className="flex flex-col h-full text-zinc-900 dark:text-zinc-100 min-h-0">
      {/* Conversation header — centered avatar + name pill, same shape a
          person-to-person chat header uses. There's no real photo for an
          this thread's own real title (or "Workers" before one exists,
          never invented), no icon, no separate background — just the
          name, so it doesn't cost the page its own visual "area." */}
      <div className={`relative flex items-center justify-center shrink-0 px-3 ${isFull ? "py-1.5" : "py-1"}`}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            className="md:hidden absolute left-1 flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        {isEditingTitle ? (
          <div className="flex items-center gap-1 w-full max-w-xs">
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitleEdit();
                if (e.key === "Escape") setIsEditingTitle(false);
              }}
              onBlur={commitTitleEdit}
              className={`min-w-0 flex-1 text-center rounded-md bg-transparent border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none ${isFull ? "text-sm" : "text-xs"}`}
            />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={commitTitleEdit} className="p-1 text-emerald-600 cursor-pointer">
              <Check size={13} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditingTitle}
            title={threadId ? "Click to rename" : undefined}
            className={`group flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300 truncate max-w-[280px] ${
              threadId ? "cursor-pointer hover:text-zinc-900 dark:hover:text-white" : "cursor-default"
            } ${isFull ? "text-sm" : "text-xs"}`}
          >
            <span className="truncate">{headerName}</span>
            {threadId && <Pencil size={11} className="text-zinc-300 dark:text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
          </button>
        )}
      </div>

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
            const prev = messages[i - 1];
            const showDivider = i === 0 || (prev && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > ONE_HOUR_MS);
            return (
              <div key={i} className="space-y-3">
                {showDivider && (
                  <p className="text-center text-[11px] font-semibold text-zinc-400 dark:text-zinc-600">{formatDivider(m.createdAt)}</p>
                )}
                <div
                  className={`flex flex-col space-y-1 ${
                    isUser ? "items-end" : "items-start"
                  }`}
                >
                <div className={`flex items-center gap-1.5 px-1 font-medium text-zinc-500 dark:text-zinc-400 ${labelSize}`}>
                  {!isUser && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={workerAvatarUri} alt="" className="w-4 h-4 shrink-0 opacity-90" />
                  )}
                  <span>{isUser ? "You" : "Worker"}</span>
                  {isUser && (
                    <UserAvatar
                      avatar={userAvatar}
                      identityFallback={identityFallback}
                      size={16}
                      className="opacity-90"
                      transparentBackground
                      fallback={<span className="w-4 h-4 rounded-full bg-zinc-300 dark:bg-zinc-700 shrink-0" />}
                    />
                  )}
                </div>
                <div
                  className={`${bubbleMaxWidth} rounded-2xl ${bubblePadding} ${textSize} transition-colors ${
                    isUser
                      ? "bg-zinc-800 dark:bg-zinc-700 text-white rounded-br-[4px]"
                      : "bg-[#f8f7fa] dark:bg-sidebar border border-black/5 dark:border-white/10 text-zinc-900 dark:text-zinc-100 rounded-bl-[4px]"
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

      {/* Composer — a plain bordered pill matching the app's other real
          inputs (bg-white/bg-zinc-900, border-zinc-200/border-zinc-800),
          not the dark-tinted glass box this used to be: that box stayed
          the same dark translucent fill in light mode too, which read as
          just wrong there instead of merely "a different theme." */}
      <div className={`relative shrink-0 ${composerPadding}`}>
        <div ref={pickerRef} className={composerColumn}>
          {showMentions && (
            <div
              role="menu"
              className="absolute bottom-full left-2 mb-2 w-64 max-h-72 overflow-y-auto rounded-xl surface-frost p-1.5 text-zinc-900 dark:text-zinc-100 font-sans antialiased z-50 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-100"
            >
              {groupedMentions.length === 0 ? (
                <p className="px-2.5 py-2 text-[12px] text-zinc-500">No skills installed yet.</p>
              ) : (
                groupedMentions.map(([productId, skills], i) => (
                  <div key={productId} className={i > 0 ? "mt-1 pt-1 border-t border-zinc-900/[0.07] dark:border-white/10" : ""}>
                    <p className="px-2.5 pt-1 pb-0.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                      {PRODUCT_GROUP_LABELS[productId]}
                    </p>
                    {skills.map((sk) => (
                      <button
                        key={sk.token}
                        type="button"
                        role="menuitem"
                        onClick={() => addSkillTag(sk.token)}
                        className={`group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.06] dark:hover:bg-white/[0.08] transition-colors cursor-pointer ${dropdownItemTextSize}`}
                      >
                        <AnySkillBadge skill={sk.token} size={18} />
                        <span className="flex-1 truncate">{sk.label}</span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Message input pill — the same frosted-glass surface the
              "Enabled Skills" tiles use in the secondary sidebar
              (bg-[#f8f7fa]/bg-sidebar + backdrop-blur + a faint border),
              not plain gray and not a saturated color. */}
          <div className={`flex flex-col gap-2 rounded-lg bg-[#f8f7fa] dark:bg-sidebar backdrop-blur-md border border-black/5 dark:border-white/10 ${inputCardPadding} shadow-sm focus-within:border-black/10 dark:focus-within:border-white/20 transition-colors duration-200`}>
            <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
              {taggedSkills.map((token) => {
                const skill = MENTIONABLE_SKILLS.find((s) => s.token === token);
                if (!skill) return null;
                return (
                  <span
                    key={token}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 ${tagPillTextSize} shrink-0`}
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
              <button
                type="button"
                title="Tag skill"
                aria-label="Tag skill"
                aria-haspopup="menu"
                aria-expanded={pickerOpen}
                onClick={() => setPickerOpen((o) => !o)}
                className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <AtSign size={15} />
              </button>
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