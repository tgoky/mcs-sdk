// src/features/reputation-manager/server/review-labels.ts
//
// What each new review is about (support, results, price and refunds,
// ...), read by Jev: one yes/no question per topic, all in one call per
// review. A review can have several topics or none. When Jev can't be
// reached the review is simply left unlabelled; nothing is guessed.
//
// The labels feed "what bad reviews talk about most" in the report blocks,
// so a client sees the fix to make, not just a star average.

import { askJev, type JevAnswer } from "@/lib/jev";

export const REVIEW_LABELS = {
  support: { name: "Support", question: "Does the review talk about customer support, responsiveness, or how the team communicated?" },
  results: { name: "Results", question: "Does the review talk about whether the product or service worked, or the results the person got?" },
  price_refund: { name: "Price or refunds", question: "Does the review talk about price, value for money, billing, charges, or refunds?" },
  delivery: { name: "Delivery", question: "Does the review talk about onboarding, access, the content or materials, or how the service was delivered?" },
  honesty: { name: "Honesty", question: "Does the review say the business was misleading, dishonest, or a scam, or overpromised?" },
  staff: { name: "A named person", question: "Does the review single out a specific person on the team, good or bad?" },
} as const;

export type ReviewLabel = keyof typeof REVIEW_LABELS;
export const REVIEW_LABEL_IDS = Object.keys(REVIEW_LABELS) as ReviewLabel[];

/** A topic counts when Jev puts it at this probability or higher. */
export const LABEL_MIN_PROBABILITY = 0.6;

/** Jev's answers to the topics that apply. */
export function labelsFromAnswers(answers: Record<string, JevAnswer | undefined>): ReviewLabel[] {
  return REVIEW_LABEL_IDS.filter((id) => {
    const a = answers[id];
    return a?.type === "noul" && a.noul >= LABEL_MIN_PROBABILITY;
  });
}

export interface ReviewToLabel {
  text: string;
  rating: number | null;
}

/** Labels for each review, in order. An empty list when it couldn't be read. */
export async function labelReviews(engagementId: string, reviews: ReviewToLabel[], runId?: string): Promise<ReviewLabel[][]> {
  const questions = Object.fromEntries(REVIEW_LABEL_IDS.map((id) => [id, { type: "noul" as const, instructions: REVIEW_LABELS[id].question }]));
  return Promise.all(
    reviews.map(async (r) => {
      if (!r.text.trim()) return [];
      try {
        const result = await askJev({
          state: { review: r.text.slice(0, 2000), rating: r.rating != null ? `${r.rating} out of 5` : undefined, context: "A customer review of a business." },
          questions,
          reading: { engagementId, purpose: "review-labels", runId: runId ?? null },
        });
        return labelsFromAnswers(result.answers);
      } catch (err) {
        console.warn(`[review-labels] couldn't label a review for ${engagementId}:`, err instanceof Error ? err.message : err);
        return [];
      }
    })
  );
}

/** The topic bad reviews (1-2 stars, or scored negative) mention most. */
export function topComplaint(rows: { labels: string[] | null; rating: number | null; sentiment: string | null }[]): { label: ReviewLabel; count: number; of: number } | null {
  const bad = rows.filter((r) => (r.rating != null ? r.rating <= 2 : r.sentiment === "negative"));
  const counts = new Map<ReviewLabel, number>();
  for (const r of bad) for (const l of r.labels ?? []) if (l in REVIEW_LABELS) counts.set(l as ReviewLabel, (counts.get(l as ReviewLabel) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || REVIEW_LABEL_IDS.indexOf(a[0]) - REVIEW_LABEL_IDS.indexOf(b[0]))[0];
  return top ? { label: top[0], count: top[1], of: bad.length } : null;
}
