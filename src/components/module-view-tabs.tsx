"use client";

import { useState, type ReactNode } from "react";
import { Users, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Splits a module page into "Clients" (the holistic per-client roster —
 * the real answer to "who is this actually running for") and "All
 * Activity" (the original flat, cross-client feed of recent runs, kept
 * exactly as it was for anyone who wants a firehose view). Clients is the
 * default tab: it's the one that avoids the old dead-end of landing on a
 * single run with no path back to that client's full history.
 *
 * Both panels stay mounted (toggled via hidden/block) rather than
 * conditionally rendered, so switching tabs doesn't reset the Activity
 * feed's own polling, filters, or pagination state.
 */
export function ModuleViewTabs({
  roster,
  activity,
  clientCount,
}: {
  roster: ReactNode;
  activity: ReactNode;
  clientCount: number;
}) {
  const [tab, setTab] = useState<"roster" | "activity">("roster");

  return (
    <div className="space-y-4 font-sans">
      <div className="inline-flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
        <button
          type="button"
          onClick={() => setTab("roster")}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
            tab === "roster" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Users size={13} />
          Clients
          <span className="text-[10px] font-mono text-zinc-500">{clientCount}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("activity")}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
            tab === "activity" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Activity size={13} />
          All Activity
        </button>
      </div>

      <div className={tab === "roster" ? "block" : "hidden"}>{roster}</div>
      <div className={tab === "activity" ? "block" : "hidden"}>{activity}</div>
    </div>
  );
}
