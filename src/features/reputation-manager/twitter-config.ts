/**
 * Config for rep-twitter-watch's twitterapis.com integration.
 *
 * Same family and pricing model as redditapis.com (same naming
 * convention, same "$0.0008/read, Bearer auth, no OAuth review" pitch),
 * used here for the same reason Reddit needed it: a keyword/mention
 * SEARCH across all of X, not a scrape of a source you already know,
 * which is the thing Outscraper's equivalent products don't offer (see
 * this app's earlier comparison of Outscraper's Reddit product for the
 * same distinction). Endpoint, auth, and response shape confirmed
 * directly against docs.twitterapis.com's own Advanced Tweet Search
 * reference page — see twitter-watch-service.ts's fetchTwitterMentions
 * for the confirmed request/response details.
 */
export function resolveTwitterApiKey(): string | null {
  const apiKey = process.env.TWITTERAPIS_API_KEY;
  return apiKey && apiKey.trim().length > 0 ? apiKey.trim() : null;
}
