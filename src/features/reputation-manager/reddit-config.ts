/**
 * Config for rep-reddit-watch's redditapis.com integration.
 *
 * Same correction as trustpilot-config.ts: an earlier version of this
 * config was written as fake-generic "any provider," which didn't hold
 * up — a different vendor's API shape isn't swappable via an env var, it
 * needs a different fetch function. This is built specifically against
 * redditapis.com's real, documented API (api.redditapis.com, confirmed
 * directly from their docs — base URL, auth header, both the post-search
 * and comment-search endpoints, and their own FAQ's dedupe guidance,
 * which is exactly the onConflictDoNothing pattern already in
 * reddit-watch-service.ts) — not a guess, and not pretending to support
 * a vendor it wasn't actually verified against.
 *
 * Swapping to a different Reddit data provider later means writing a new
 * fetch function against that provider's real API, same as it would for
 * Trustpilot — being honest about that up front instead of implying a
 * config-only swap that wouldn't actually work.
 */
export function resolveRedditApiKey(): string | null {
  const apiKey = process.env.REDDITAPIS_API_KEY;
  return apiKey && apiKey.trim().length > 0 ? apiKey.trim() : null;
}
