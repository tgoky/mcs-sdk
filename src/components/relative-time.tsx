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
 * the app. Renders "Aug 14, 2:30 PM (2h ago)" with the full string in
 * the native <time> title attribute for hover precision.
 *
 * Re-evaluates every 10s (not 1s — these are queue/execution timestamps,
 * not a stopwatch). Accepts className so callers can match surrounding
 * text size/color without fighting internal styles.
 */
export function VerboseTime({ isoString, className }: { isoString: string; className?: string }) {
  const compute = useCallback(() => formatVerboseDate(isoString), [isoString]);
  const [formatted, setFormatted] = useState(compute);

  useEffect(() => {
    const id = setInterval(() => setFormatted(compute()), 10_000);
    return () => clearInterval(id);
  }, [compute]);

  return (
    <time dateTime={isoString} title={formatted.full} className={className}>
      {formatted.absolute}
      <span className="text-zinc-400 dark:text-zinc-500 font-mono text-[10px] ml-1">
        ({formatted.relative})
      </span>
    </time>
  );
}