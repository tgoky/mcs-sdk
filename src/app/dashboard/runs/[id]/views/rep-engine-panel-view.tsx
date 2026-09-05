"use client";

import { useMemo, useState } from "react";
import { Radar, Search } from "lucide-react";
import { EmptyState } from "../_shared/empty-state";
import { SentimentPill, FlaggedPill } from "../_shared/sentiment-pill";
import type { RepEnginePanelDetail } from "../_shared/types";

export function RepEnginePanelView({ detail }: { detail: RepEnginePanelDetail }) {
  const [filterText, setFilterText] = useState("");
  const { findings } = detail;

  const filtered = useMemo(() => {
    if (!filterText.trim()) return findings;
    const q = filterText.toLowerCase();
    return findings.filter(
      (f) => f.engineId.toLowerCase().includes(q) || f.promptText.toLowerCase().includes(q) || f.responseText.toLowerCase().includes(q)
    );
  }, [findings, filterText]);

  if (findings.length === 0) {
    return (
      <EmptyState
        icon={Radar}
        title="No findings recorded for this run"
        description="This run either failed before scoring completed, or none of the configured AI engines returned a response for this client's seed prompts."
      />
    );
  }

  const flaggedCount = findings.filter((f) => f.flagged).length;

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f8f7fa] dark:bg-zinc-950 p-1.5 border border-zinc-200 dark:border-zinc-800">
        <div className="relative w-64">
          <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500 dark:text-zinc-500" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search engine, prompt, or response..."
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none"
          />
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-500 pr-2">
          {findings.length} response{findings.length === 1 ? "" : "s"} · {flaggedCount} flagged
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((f) => (
          <div key={f.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3.5">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{f.engineId}</span>
              <div className="flex items-center gap-2">
                <FlaggedPill flagged={f.flagged} reason={f.flagReason} />
                <SentimentPill sentiment={f.sentiment} />
              </div>
            </div>
            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1">{f.promptText}</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-3">{f.responseText}</p>
            {f.flagReason && <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1.5">{f.flagReason}</p>}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-zinc-500 dark:text-zinc-500 italic text-center py-6">No findings match your search.</p>
        )}
      </div>
    </div>
  );
}
