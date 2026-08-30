"use client";

import { useEffect, useRef, useState } from "react";
import { 
  Send, Sparkles, CheckCircle2, XCircle, ArrowUpRight, Search, 
  Plus, Mic, ChevronLeft, Share2, Settings, X, Clock, PauseCircle 
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

function readStoredThreadId(): string | null {
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
    // Best-effort session persistence
  }
}

export const MENTIONABLE_SKILLS = [
  { token: "call-brief", label: "Call Brief" },
  { token: "leak-map", label: "Leak Map" },
];

export function TeammatesChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState<boolean>(() => readStoredThreadId() !== null);
  const [error, setError] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(() => readStoredThreadId());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = readStoredThreadId();
    if (!id) return;
    let cancelled = false;
    fetch(`/api/teammates/threads/${id}`)
      .then((r) => {
        if (r.status === 404) {
          writeStoredThreadId(null);
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
    mentionQuery === null ? [] : MENTIONABLE_SKILLS.filter((s) => s.token.toLowerCase().startsWith(mentionQuery.toLowerCase()));
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

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
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
    <div className="flex h-full w-full bg-white dark:bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800 shadow-xl">
      {/* 1. LEFT COLUMN: Agent Roster */}
      <aside className="w-64 hidden md:flex flex-col border-r border-zinc-200/70 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/40">
        <div className="p-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search skills & agents"
              className="w-full bg-zinc-200/50 dark:bg-zinc-800/60 pl-8 pr-3 py-1.5 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:text-zinc-200 placeholder:text-zinc-400"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/80 shadow-xs cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              <Sparkles size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">Teammates Agent</span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">Active Assistant</p>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. CENTER COLUMN: Live Chat Stream */}
      <main className="flex-1 flex flex-col bg-white dark:bg-zinc-950 min-w-0">
        <PinnedSkillsBar onSelect={appendMention} />
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {historyLoading && (
            <div className="flex items-center gap-2 px-1">
              <PrefillLoader size={14} />
              <span className="text-[11px] text-zinc-400">Loading conversation…</span>
            </div>
          )}

          {!historyLoading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-4">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
                <Sparkles size={18} />
              </span>
              <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Ask Teammates to run something</p>
              <p className="text-[11px] text-zinc-400 max-w-[240px] leading-relaxed">
                Try &quot;run a call brief for Acme Co&quot; — type @ to see available tools.
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                  m.role === "user"
                    ? "bg-zinc-950 text-white rounded-tr-xs dark:bg-zinc-100 dark:text-zinc-950 font-medium"
                    : "bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-tl-xs border border-zinc-200/50 dark:border-zinc-800"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>

                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="mt-2.5 space-y-1 pt-2 border-t border-zinc-200/60 dark:border-zinc-800">
                    {m.toolCalls.map((tc, j) => (
                      <div key={j} className="flex items-start gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                        {tc.ok ? (
                          <CheckCircle2 size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle size={12} className="text-rose-500 shrink-0 mt-0.5" />
                        )}
                        <span>{tc.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {m.links && m.links.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 pt-2 border-t border-zinc-200/60 dark:border-zinc-800">
                    {m.links.map((link, j) => (
                      <a
                        key={j}
                        href={link.href}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-purple-600 dark:text-purple-400 hover:opacity-80 transition-opacity"
                      >
                        {link.label}
                        <ArrowUpRight size={11} />
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
              <span className="text-[11px] text-zinc-400">Working on it…</span>
            </div>
          )}
          {error && <p className="text-[11px] text-rose-500 px-1">{error}</p>}
        </div>

        {/* Floating Input Footer */}
        <div className="relative shrink-0 p-3 border-t border-zinc-100 dark:border-zinc-800/80">
          {showMentions && (
            <div className="absolute bottom-full left-3 mb-1.5 rounded-xl shadow-xl overflow-hidden z-20 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              {filteredMentions.map((s) => (
                <button
                  key={s.token}
                  type="button"
                  onClick={() => insertMention(s.token)}
                  className="block w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 transition-colors cursor-pointer"
                >
                  @{s.token}
                  <span className="ml-1.5 text-[10px] text-zinc-400">{s.label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 bg-zinc-100/80 dark:bg-zinc-900/80 rounded-full px-3 py-1.5 border border-zinc-200/60 dark:border-zinc-800 focus-within:ring-1 focus-within:ring-zinc-400">
            <button className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
              <Plus className="h-4 w-4" />
            </button>
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
              className="flex-1 resize-none bg-transparent text-xs outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || !input.trim()}
              className="w-7 h-7 rounded-full bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 flex items-center justify-center disabled:opacity-40 transition-opacity shrink-0 cursor-pointer"
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      </main>

      {/* 3. RIGHT COLUMN: Context Rail */}
      <aside className="w-64 hidden lg:flex flex-col border-l border-zinc-200/70 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 p-4 gap-5">
        <div className="flex items-center justify-between text-zinc-400">
          <ChevronLeft className="h-4 w-4 cursor-pointer hover:text-zinc-600" />
          <div className="flex items-center gap-2.5">
            <Share2 className="h-3.5 w-3.5 cursor-pointer hover:text-zinc-600" />
            <Settings className="h-3.5 w-3.5 cursor-pointer hover:text-zinc-600" />
            <X className="h-3.5 w-3.5 cursor-pointer hover:text-zinc-600" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="aspect-video w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-1 shadow-xs overflow-hidden flex items-center justify-center">
            <div className="w-full h-full bg-zinc-100 dark:bg-zinc-900 rounded-lg flex items-center justify-center text-[10px] text-zinc-400">
              [ Workspace Context ]
            </div>
          </div>
          <p className="text-center text-[11px] font-medium text-zinc-500">Teammate context</p>
        </div>

        <div className="space-y-3">
          <span className="text-[11px] font-bold text-zinc-400 tracking-wider uppercase">
            Routines
          </span>
          <div className="space-y-2.5">
            <div className="flex items-start gap-2.5">
              <Clock className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Call Briefs</div>
                <div className="text-[10px] text-zinc-400">Runs before scheduled calls</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Funnel Audit</div>
                <div className="text-[10px] text-zinc-400">Weekly automated scan</div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}