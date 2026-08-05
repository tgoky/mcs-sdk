"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Building2,
  Play,
  FolderKanban,
  ListChecks,
  Loader2,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { runStatusColor } from "@/lib/copy";

interface ClientResult {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  badge: string | null;
}
interface ExecutionResult {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  status: string;
}
interface ProjectResult {
  id: string;
  title: string;
  subtitle: string;
  href: string;
}
interface QueueResult {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  category: string;
}

interface SearchResponse {
  query: string;
  clients: ClientResult[];
  executions: ExecutionResult[];
  projects: ProjectResult[];
  queue: QueueResult[];
  totalCount: number;
}

const EMPTY_RESULTS: SearchResponse = {
  query: "",
  clients: [],
  executions: [],
  projects: [],
  queue: [],
  totalCount: 0,
};

// Quick destinations shown before the person has typed anything — the
// ⌘K palette should still be useful with an empty query, the same way
// Asana's omnibox offers navigation shortcuts up front.
const QUICK_LINKS = [
  { label: "Go to Queue", href: "/dashboard/queue", icon: ListChecks },
  { label: "Go to Executions", href: "/dashboard/runs", icon: Play },
  { label: "Go to Engagements", href: "/dashboard/engagements", icon: Building2 },
  { label: "Go to Projects", href: "/dashboard/projects", icon: FolderKanban },
];

type FlatRow =
  | { kind: "client"; href: string; item: ClientResult }
  | { kind: "execution"; href: string; item: ExecutionResult }
  | { kind: "project"; href: string; item: ProjectResult }
  | { kind: "queue"; href: string; item: QueueResult }
  | { kind: "quick"; href: string; item: (typeof QUICK_LINKS)[number] };

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(EMPTY_RESULTS);
    setActiveIndex(0);
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // ⌘K / Ctrl+K opens the palette from anywhere in the dashboard — makes
  // the "⌘K" hint already printed on the trigger button actually true.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      // Let the panel mount before focusing.
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Debounced fetch — 250ms, aborts the previous in-flight request so a
  // fast typist never has a stale response race ahead of the latest one.
  // An empty query just skips fetching; EMPTY_RESULTS is substituted at
  // render time below (see `effectiveResults`) rather than reset here, so
  // this effect only ever calls setState in response to the fetch itself.
  useEffect(() => {
    if (!open || !query.trim()) return;
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: SearchResponse) => {
          if (!controller.signal.aborted) setResults(data);
        })
        .catch((err) => {
          if (err?.name !== "AbortError") console.error("[global-search]", err);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const flatRows = useMemo<FlatRow[]>(() => {
    if (!query.trim()) {
      return QUICK_LINKS.map((item) => ({ kind: "quick", href: item.href, item }));
    }
    return [
      ...results.clients.map((item): FlatRow => ({ kind: "client", href: item.href, item })),
      ...results.executions.map((item): FlatRow => ({ kind: "execution", href: item.href, item })),
      ...results.projects.map((item): FlatRow => ({ kind: "project", href: item.href, item })),
      ...results.queue.map((item): FlatRow => ({ kind: "queue", href: item.href, item })),
    ];
  }, [query, results]);

  useEffect(() => {
    setActiveIndex(0);
  }, [flatRows.length, query]);

  function navigateTo(href: string) {
    closePalette();
    router.push(href);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatRows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = flatRows[activeIndex];
      if (row) navigateTo(row.href);
    }
  }

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closePalette();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, closePalette]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-800 rounded-md transition-colors w-52 md:w-72 cursor-pointer"
      >
        <Search className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
        <span className="flex-1 text-left truncate">Search...</span>
        <kbd className="text-[10px] font-mono bg-white dark:bg-zinc-950 px-1 rounded border border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 shrink-0">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 backdrop-blur-[2px] pt-[12vh] px-4">
          <div
            ref={containerRef}
            className="w-full max-w-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden font-sans antialiased"
          >
            {/* Input row */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <Search className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Search clients, executions, projects, queue..."
                className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none"
              />
              {loading && <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin shrink-0" />}
              <kbd className="text-[10px] font-mono bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 shrink-0">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto py-1.5">
              {!query.trim() && (
                <ResultGroup label="Jump to">
                  {QUICK_LINKS.map((item, i) => (
                    <ResultRow
                      key={item.href}
                      href={item.href}
                      icon={item.icon}
                      title={item.label}
                      subtitle={null}
                      active={i === activeIndex}
                      onClick={() => navigateTo(item.href)}
                      onMouseEnter={() => setActiveIndex(i)}
                    />
                  ))}
                </ResultGroup>
              )}

              {query.trim() && !loading && results.totalCount === 0 && (
                <div className="px-4 py-8 text-center text-xs font-mono text-zinc-400 dark:text-zinc-600">
                  No results for &ldquo;{query}&rdquo;
                </div>
              )}

              {query.trim() && results.clients.length > 0 && (
                <ResultGroup label="Clients">
                  {results.clients.map((item) => {
                    const idx = flatRows.findIndex((r) => r.kind === "client" && r.item.id === item.id);
                    return (
                      <ResultRow
                        key={item.id}
                        href={item.href}
                        icon={Building2}
                        title={item.title}
                        subtitle={item.subtitle}
                        badge={item.badge}
                        active={idx === activeIndex}
                        onClick={() => navigateTo(item.href)}
                        onMouseEnter={() => setActiveIndex(idx)}
                      />
                    );
                  })}
                </ResultGroup>
              )}

              {query.trim() && results.executions.length > 0 && (
                <ResultGroup label="Executions">
                  {results.executions.map((item) => {
                    const idx = flatRows.findIndex((r) => r.kind === "execution" && r.item.id === item.id);
                    return (
                      <ResultRow
                        key={item.id}
                        href={item.href}
                        icon={Play}
                        title={item.title}
                        subtitle={item.subtitle}
                        statusDot={runStatusColor(item.status)}
                        active={idx === activeIndex}
                        onClick={() => navigateTo(item.href)}
                        onMouseEnter={() => setActiveIndex(idx)}
                      />
                    );
                  })}
                </ResultGroup>
              )}

              {query.trim() && results.projects.length > 0 && (
                <ResultGroup label="Projects">
                  {results.projects.map((item) => {
                    const idx = flatRows.findIndex((r) => r.kind === "project" && r.item.id === item.id);
                    return (
                      <ResultRow
                        key={item.id}
                        href={item.href}
                        icon={FolderKanban}
                        title={item.title}
                        subtitle={item.subtitle}
                        active={idx === activeIndex}
                        onClick={() => navigateTo(item.href)}
                        onMouseEnter={() => setActiveIndex(idx)}
                      />
                    );
                  })}
                </ResultGroup>
              )}

              {query.trim() && results.queue.length > 0 && (
                <ResultGroup label="Queue">
                  {results.queue.map((item) => {
                    const idx = flatRows.findIndex((r) => r.kind === "queue" && r.item.id === item.id);
                    return (
                      <ResultRow
                        key={item.id}
                        href={item.href}
                        icon={ListChecks}
                        title={item.title}
                        subtitle={item.subtitle}
                        active={idx === activeIndex}
                        onClick={() => navigateTo(item.href)}
                        onMouseEnter={() => setActiveIndex(idx)}
                      />
                    );
                  })}
                </ResultGroup>
              )}
            </div>

            {/* Footer hint bar */}
            <div className="flex items-center gap-3 px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 text-[10px] font-mono text-zinc-400 dark:text-zinc-600">
              <span className="flex items-center gap-1">
                <ArrowUp className="w-2.5 h-2.5" />
                <ArrowDown className="w-2.5 h-2.5" /> Navigate
              </span>
              <span className="flex items-center gap-1">
                <CornerDownLeft className="w-2.5 h-2.5" /> Select
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResultGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-1.5 py-1">
      <div className="px-2.5 py-1 text-[10px] font-bold font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ResultRow({
  href,
  icon: Icon,
  title,
  subtitle,
  badge,
  statusDot,
  active,
  onClick,
  onMouseEnter,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  subtitle: string | null;
  badge?: string | null;
  statusDot?: string;
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      onMouseEnter={onMouseEnter}
      className={`flex items-center gap-2.5 mx-1.5 px-2.5 py-2 rounded-md transition-colors ${
        active ? "bg-zinc-100 dark:bg-zinc-900" : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
      }`}
    >
      <Icon className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{title}</p>
        {subtitle && <p className="text-[11px] text-zinc-500 dark:text-zinc-500 truncate">{subtitle}</p>}
      </div>
      {statusDot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot.includes("rose") ? "bg-rose-400" : statusDot.includes("gold") ? "bg-amber-400" : statusDot.includes("amber") ? "bg-amber-400" : "bg-zinc-400"}`} />}
      {badge && (
        <span className="text-[9px] font-bold font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 shrink-0">
          {badge}
        </span>
      )}
    </Link>
  );
}
