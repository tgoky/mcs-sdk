// src/lib/site-read.ts
//
// When a setup's Activate may reuse the site read another product (or an
// earlier Activate) already stored, instead of crawling again. One rule for
// Showtime, Cold Open and Reputation Manager, so "Read again" means the same
// thing on all three.

import type { ClientFact } from "@/lib/client-facts";

/** A stored read older than this is read again on the next Activate. */
export const SITE_READ_FRESH_DAYS = 30;

/**
 * True when the stored corpus is a non-empty read of this same site, from
 * within SITE_READ_FRESH_DAYS, and the person didn't ask to read it again.
 * `sameHost` is the caller's own host comparison (each route normalizes
 * hosts its own way).
 */
export function isSiteReadReusable(opts: { corpus: ClientFact | null | undefined; sameHost: boolean; force?: boolean; now?: number }): boolean {
  const { corpus, sameHost, force } = opts;
  if (force || !corpus || !sameHost) return false;
  if (typeof corpus.value !== "string" || !corpus.value.trim()) return false;
  const age = (opts.now ?? Date.now()) - new Date(corpus.updatedAt).getTime();
  return Number.isFinite(age) && age < SITE_READ_FRESH_DAYS * 24 * 60 * 60 * 1000;
}

/** The request's own "read it again" flag. */
export function wantsFreshRead(body: unknown): boolean {
  return Boolean(body && typeof body === "object" && (body as { force?: unknown }).force === true);
}
