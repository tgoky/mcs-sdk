"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Pure function — no React, no hook. Use this when you need the formatted
 * strings but want to control your own markup (e.g. inline inside a
 * colored <p> tag where a <time> wrapper would break the text flow).
 */
export function formatVerboseDate(iso: string | Date) {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (!date || isNaN(date.getTime())) {
    return { relative: "—", absolute: "—", full: "—" };
  }

  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  let relative = "just now";
  if (mins >= 1 && mins < 60) relative = `${mins}m ago`;
  else if (hours >= 1 && hours < 24) relative = `${hours}h ago`;
  else if (days >= 1) relative = `${days}d ago`;

  // e.g. "Aug 14, 2:30 PM"
  const absolute = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return { relative, absolute, full: `${absolute} (${relative})` };
}

/**
 * Drop-in replacement for every local RelativeTime / relativeTime across
 * the app. Renders "2h ago · Aug 14, 2:30 PM" with the full string in
 * the native <time> title attribute for hover precision.
 *
 * Fix: this used to lead with the absolute timestamp and bury "how old is
 * this" in 10px low-contrast text — exactly backwards for a queue/feed a
 * user is scanning to spot what's new. Age now leads, at full weight, and
 * anything inside FRESH_MS gets a small pulsing dot + accent color so a
 * just-arrived row is visible without reading the text at all.
 *
 * Re-evaluates every 10s (not 1s — these are queue/execution timestamps,
 * not a stopwatch). Accepts className so callers can match surrounding
 * text size/color without fighting internal styles.
 */
const FRESH_MS = 60_000; // items younger than this get the "just arrived" treatment

export function VerboseTime({
  isoString,
  className,
  showFreshIndicator = true,
}: {
  isoString: string;
  className?: string;
  /** Set false for contexts (e.g. a static preview panel) where a pulsing dot would be noise. */
  showFreshIndicator?: boolean;
}) {
  const compute = useCallback(() => formatVerboseDate(isoString), [isoString]);
  const [formatted, setFormatted] = useState(compute);
  const [isFresh, setIsFresh] = useState(() => Date.now() - new Date(isoString).getTime() < FRESH_MS);

  useEffect(() => {
    const id = setInterval(() => {
      setFormatted(compute());
      setIsFresh(Date.now() - new Date(isoString).getTime() < FRESH_MS);
    }, 10_000);
    return () => clearInterval(id);
  }, [compute, isoString]);

  const fresh = showFreshIndicator && isFresh;

  return (
    <time dateTime={isoString} title={formatted.full} className={className}>
      <span className="inline-flex items-center gap-1.5">
        {fresh && (
          <span className="relative inline-flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
        )}
        <span className={fresh ? "font-bold text-emerald-600 dark:text-emerald-400" : ""}>
          {formatted.relative}
        </span>
      </span>
      <span className="text-zinc-400 dark:text-zinc-500 font-mono text-[10px] ml-1.5">
        {formatted.absolute}
      </span>
    </time>
  );
}