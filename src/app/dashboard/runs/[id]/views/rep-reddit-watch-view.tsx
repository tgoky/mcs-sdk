"use client";

import { MessageCircle, ExternalLink } from "lucide-react";
import { EmptyState } from "../_shared/empty-state";
import { SentimentPill, FlaggedPill } from "../_shared/sentiment-pill";
import type { RepRedditWatchDetail } from "../_shared/types";

export function RepRedditWatchView({ detail }: { detail: RepRedditWatchDetail }) {
  const { mentions } = detail;

  if (mentions.length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="No new mentions in this run"
        description="This run found no new Reddit mentions since the last check — a normal, healthy outcome, not a failure."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 font-sans antialiased">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
        {mentions.length} new mention{mentions.length === 1 ? "" : "s"} · {mentions.filter((m) => m.flagged).length} flagged
      </p>
      {mentions.map((m) => (
        <div key={m.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-600 dark:text-zinc-400">
              <span className="font-bold">r/{m.subreddit}</span>
              {m.author && <span>· u/{m.author}</span>}
              <a href={m.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
                <ExternalLink size={11} />
              </a>
            </div>
            <div className="flex items-center gap-2">
              <FlaggedPill flagged={m.flagged} reason={m.flagReason} />
              <SentimentPill sentiment={m.sentiment} />
            </div>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{m.mentionText}</p>
          {m.flagReason && <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1.5">{m.flagReason}</p>}
        </div>
      ))}
    </div>
  );
}
