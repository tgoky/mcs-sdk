"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type LabelMap = Record<string, string>;

interface BreadcrumbContextValue {
  labels: LabelMap;
  setLabel: (pathname: string, label: string) => void;
  clearLabel: (pathname: string) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

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
  const [labels, setLabels] = useState<LabelMap>({});

  function setLabel(pathname: string, label: string) {
    setLabels((prev) => (prev[pathname] === label ? prev : { ...prev, [pathname]: label }));
  }

  function clearLabel(pathname: string) {
    setLabels((prev) => {
      if (!(pathname in prev)) return prev;
      const next = { ...prev };
      delete next[pathname];
      return next;
    });
  }

  return (
    <BreadcrumbContext.Provider value={{ labels, setLabel, clearLabel }}>
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
