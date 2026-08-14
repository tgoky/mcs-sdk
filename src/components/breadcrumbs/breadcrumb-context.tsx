"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { labelForPath } from "./label-for-path";

type LabelMap = Record<string, string>;

interface BreadcrumbContextValue {
  labels: LabelMap;
  setLabel: (pathname: string, label: string) => void;
  clearLabel: (pathname: string) => void;
  /** Every pathname visited in this tab this session, oldest first, current
   * page last. Powers <BackLink/> — see usePreviousPage below. */
  history: string[];
  /** Same idea as `labels`, but never cleared on unmount. `labels` is
   * intentionally wiped when a page unmounts so a stale crumb never lingers
   * on a page you're not on; BackLink needs the opposite — it's reading the
   * name of a page you just LEFT, which unmounts (and would otherwise clear
   * its label) in the same commit that the next page mounts. */
  historyLabels: LabelMap;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

const HISTORY_STORAGE_KEY = "mcs-nav-history-v1";
const MAX_HISTORY = 25;

function readStoredHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    // Private browsing / storage disabled — degrade to in-memory-only
    // history for this page load rather than throwing.
    return [];
  }
}

/**
 * Wraps the whole authenticated shell (see layout.tsx) so that both the
 * header's <Breadcrumbs /> (reader) and any page deep in the tree (writer)
 * share one label map keyed by pathname.
 *
 * Why a context instead of just deriving crumbs from the URL: a segment
 * like /dashboard/engagements/f47ac10b-58cc... is meaningless to a human.
 * The page that already fetched that engagement knows its buyer name —
 * <SetBreadcrumbLabel label={engagement.buyer} /> (rendered once from that
 * page, server or client) pushes it in here so the breadcrumb reads
 * "Engagements › Sarah's Workspace" instead of a raw UUID. No prop
 * drilling from page → layout required, and no duplicate data fetch in
 * the header just to look up a name it would otherwise have to re-query.
 */
export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [labels, setLabels] = useState<LabelMap>({});
  const [historyLabels, setHistoryLabels] = useState<LabelMap>({});
  const [history, setHistory] = useState<string[]>(readStoredHistory);
  // Tracks the last pathname we've already recorded, so the append below
  // runs (at most) once per actual navigation rather than once per render.
  // State, not a ref: mutating a ref during render is unsafe (and disallowed
  // by the React Compiler) even though this exact "compare to previous,
  // setState if different" shape is the docs-sanctioned way to derive state
  // during render — see "Adjusting state when a prop changes" below.
  const [lastTrackedPath, setLastTrackedPath] = useState<string | null>(history[history.length - 1] ?? null);

  // Recording the visit here, during render, rather than in a useEffect,
  // is deliberate (see React's "Adjusting state when a prop changes"
  // pattern): an effect in this provider would run AFTER the new page's
  // own mount effects, including any <BackLink/> on it reading
  // usePreviousPage() — so the very page that most needs the "where did I
  // just come from" answer would always see last navigation's answer, one
  // page too late. Updating state mid-render like this is React-sanctioned
  // specifically to avoid that one-render lag.
  if (pathname && lastTrackedPath !== pathname) {
    setLastTrackedPath(pathname);
    setHistory((prev) => {
      const next = [...prev, pathname].slice(-MAX_HISTORY);
      try {
        window.sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable — history still works in-memory for this tab.
      }
      return next;
    });
  }

  function setLabel(pathname: string, label: string) {
    setLabels((prev) => (prev[pathname] === label ? prev : { ...prev, [pathname]: label }));
    setHistoryLabels((prev) => (prev[pathname] === label ? prev : { ...prev, [pathname]: label }));
  }

  function clearLabel(pathname: string) {
    setLabels((prev) => {
      if (!(pathname in prev)) return prev;
      const next = { ...prev };
      delete next[pathname];
      return next;
    });
    // historyLabels intentionally untouched — see field doc above.
  }

  return (
    <BreadcrumbContext.Provider value={{ labels, setLabel, clearLabel, history, historyLabels }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

function useBreadcrumbContext(): BreadcrumbContextValue {
  const ctx = useContext(BreadcrumbContext);
  if (!ctx) {
    throw new Error("useBreadcrumbContext must be used within a BreadcrumbProvider");
  }
  return ctx;
}

export function useBreadcrumbLabels(): LabelMap {
  return useBreadcrumbContext().labels;
}

/**
 * Where the user actually was immediately before the current page — the
 * real "came from," not a hardcoded parent route. Powers <BackLink/>.
 *
 * Returns null when this tab has no genuine previous page yet (a fresh
 * tab, a hard refresh, or a bookmarked/shared link straight to this
 * page), in which case the caller should fall back to its own default
 * destination.
 */
export function usePreviousPage(): { href: string; label: string } | null {
  const { history, historyLabels } = useBreadcrumbContext();
  const pathname = usePathname();

  // The stack's last entry is the CURRENT page. Walk backward from just
  // before it for the first different pathname — normally that's simply
  // history[length - 2], but a rapid double-navigation (e.g. a redirect)
  // can leave a duplicate of the current path sitting right before it.
  for (let i = history.length - 2; i >= 0; i--) {
    const candidate = history[i];
    if (candidate && candidate !== pathname) {
      return { href: candidate, label: labelForPath(candidate, historyLabels) };
    }
  }
  return null;
}

/**
 * Rendered once from a dynamic-segment page (e.g. the engagement detail
 * page) to register that page's human-readable title for the CURRENT
 * pathname. Cleans up its own entry on unmount so navigating away doesn't
 * leave a stale label attached to that path for next time.
 */
export function SetBreadcrumbLabel({ label }: { label: string }) {
  const pathname = usePathname();
  const { setLabel, clearLabel } = useBreadcrumbContext();
  // Guards against re-registering identical (pathname, label) pairs on
  // every render, which would otherwise re-trigger the context update →
  // header re-render loop on each parent render of the owning page.
  const registeredRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${pathname}::${label}`;
    if (registeredRef.current === key) return;
    registeredRef.current = key;
    setLabel(pathname, label);
    return () => clearLabel(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, label]);

  return null;
}
