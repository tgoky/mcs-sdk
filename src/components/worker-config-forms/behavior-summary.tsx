"use client";

// Phase 3's "preview-first entry point," extended to the workers that
// produce no visual artifact to preview (pile-on, source-connect,
// send-connect, daily-send, win-back, whop-bridge-manager — found in this
// session's own follow-up review to have nothing a content preview could
// show). Rather than force a fake preview onto them, this translates the
// CURRENT form state into a plain-language statement of what will
// actually happen when the worker runs — computed live from real values,
// same honesty level as a content preview, just narrower in form (a
// sentence, not a rendered artifact).
//
// Each line is the caller's own responsibility to compute correctly from
// its real save-payload shape — this component only renders them
// consistently.

import { Zap } from "lucide-react";

export function BehaviorSummary({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30">
        <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">What this means</span>
      </div>
      <ul className="p-3 space-y-1.5 bg-white dark:bg-zinc-950">
        {lines.map((line, i) => (
          <li key={i} className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed flex items-start gap-1.5">
            <span className="text-zinc-300 dark:text-zinc-700 mt-0.5">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
