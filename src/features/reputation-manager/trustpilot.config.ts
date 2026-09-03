/**
 * Config for rep-trustpilot-watch's Outscraper integration.
 *
 * Outscraper — one company, one maintained API, with a real documented
 * /trustpilot-reviews endpoint confirmed directly against their own
 * OpenAPI spec (docs.outscraper.com/api-docs-data.json) and endpoint
 * reference page, not inferred from marketing copy. Base URL, auth
 * header, exact query params, and exact response field names are all
 * confirmed real, not best-effort guesses — see trustpilot-watch-service.ts.
 *
 * Deliberately single-vendor and honest about it — an earlier version of
 * this config implied genuine cross-vendor flexibility (swap the env var,
 * works with any scraping provider) that wasn't actually true, since
 * different vendors have entirely different API shapes. Not repeating
 * that mistake: this is built specifically for Outscraper's real,
 * verified API. Swapping providers later means writing a new fetch
 * function against that provider's real API, not just changing an env var.
 *
 * Pay-as-you-go, no per-keyword ceiling — unlike the subscription-based
 * aggregators (Octolens/Mentionkit) originally considered for this.
 */
export function resolveOutscraperConfig(): { apiKey: string } | null {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) return null;
  return { apiKey: apiKey.trim() };
}
