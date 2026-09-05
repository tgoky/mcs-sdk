"use client";

import { Star } from "lucide-react";
import { EmptyState } from "../_shared/empty-state";
import { SentimentPill, FlaggedPill } from "../_shared/sentiment-pill";
import type { RepTrustpilotWatchDetail } from "../_shared/types";

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${rating}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={11} className={i < rating ? "fill-amber-400 text-amber-400" : "text-zinc-300 dark:text-zinc-700"} />
      ))}
    </span>
  );
}

export function RepTrustpilotWatchView({ detail }: { detail: RepTrustpilotWatchDetail }) {
  const { reviews } = detail;

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title="No new reviews in this run"
        description="This run found no new Trustpilot reviews since the last check — a normal, healthy outcome, not a failure."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 font-sans antialiased">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
        {reviews.length} new review{reviews.length === 1 ? "" : "s"} · {reviews.filter((r) => r.flagged).length} flagged
      </p>
      {reviews.map((r) => (
        <div key={r.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <StarRating rating={r.rating} />
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{r.reviewerName ?? "Anonymous"}</span>
            </div>
            <div className="flex items-center gap-2">
              <FlaggedPill flagged={r.flagged} reason={r.flagReason} />
              <SentimentPill sentiment={r.sentiment} />
            </div>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{r.reviewText}</p>
          {r.flagReason && <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1.5">{r.flagReason}</p>}
        </div>
      ))}
    </div>
  );
}
