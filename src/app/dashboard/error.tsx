"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

/**
 * Catches any error thrown while rendering dashboard/page.tsx or any other
 * page directly under this segment (a dropped DB connection, a transient
 * Supabase pooler hiccup, etc). Without this file, an error here previously
 * bubbled up to the nearest boundary above the whole app shell, which reads
 * as a blank or broken page with no way back in except a manual reload.
 *
 * `reset()` re-renders the segment in place — it does not reload the page
 * or lose the sidebar — so retrying is a single click.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard]", error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[50vh] w-full items-center justify-center px-1">
      <div className="max-w-sm text-center space-y-4">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900">
          <RotateCcw size={16} className="text-zinc-500 dark:text-zinc-400" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            This page didn&apos;t load
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Something went wrong reaching your data. This is usually temporary.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            onClick={reset}
            className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 cursor-pointer"
          >
            Try again
          </button>
          <a
            href="/home"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
          >
            Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
