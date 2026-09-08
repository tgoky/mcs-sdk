"use client";

// src/components/reports/account-advisor-panel.tsx
//
// The on-demand "act like an assistant, give me a real rundown" trigger
// — distinct from the small per-block trend labels above it. Real LLM
// synthesis across every enabled worker's current data + trend +
// correlation flags (account-advisor.ts), triggered by the user, kept as
// real history instead of overwritten on the next click.

import { useState } from "react";
import { Sparkle, Loader2 } from "lucide-react";
import { VerboseTime } from "@/components/relative-time";

interface AccountReview {
  id: string;
  reviewText: string;
  generatedAt: string;
}

export function AccountAdvisorPanel({
  engagementId,
  initialReviews,
}: {
  engagementId: string;
  initialReviews: AccountReview[];
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/account-review`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not generate a review.");
      setReviews((prev) => [body.review, ...prev]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate a review.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Account review</h2>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white dark:text-zinc-900 transition-colors cursor-pointer"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkle size={13} />}
          {loading ? "Reviewing…" : "Generate account review"}
        </button>
      </div>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      {reviews.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          No reviews yet — generate one to get a real read across everything enabled for this client.
        </p>
      ) : (
        <div className="space-y-4 divide-y divide-zinc-200 dark:divide-zinc-800/80">
          {reviews.map((review) => (
            <div key={review.id} className="pt-4 first:pt-0 space-y-1">
              <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">{review.reviewText}</p>
              <VerboseTime isoString={review.generatedAt} className="text-[11px] text-zinc-400 dark:text-zinc-600" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
