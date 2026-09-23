// src/features/reputation-manager/server/outscraper-google.ts
//
// Outscraper's Google endpoints, read against their API reference
// (app.outscraper.cloud/api-docs, "google" tag): Maps search, Maps
// reviews, News search and web search. Same key and header as the
// Trustpilot watch (X-API-KEY). Every call sends async=false: Outscraper
// defaults to async=true, which answers with a request id and no data.
//
// Billing is per result (per place, per review; an empty search still
// counts as one), so callers pass tight limits and a cutoff.

import { fetchWithTimeout } from "@/lib/http";
import type { RepGoogleListing } from "@/models/schema";
import { resolveOutscraperConfig } from "@/features/reputation-manager/trustpilot-config";

const BASE = "https://api.outscraper.cloud";
const TIMEOUT_MS = 60_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

async function outscraper(path: string, params: Record<string, string | number | boolean | undefined>): Promise<Raw> {
  const config = resolveOutscraperConfig();
  if (!config) throw new Error("OUTSCRAPER_API_KEY not configured.");
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  url.searchParams.set("async", "false");
  const res = await fetchWithTimeout(url, { headers: { "X-API-KEY": config.apiKey } }, TIMEOUT_MS);
  // 204: "finished with failure and has no results" per the reference.
  if (res.status === 204) return { data: [] };
  if (!res.ok) throw new Error(`Outscraper ${path} failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** data comes back as one array per query ([[...]]) for searches, or a
 * flat array of places for reviews; either way, the first query's rows. */
export function firstQueryRows(body: Raw): Raw[] {
  const data = body?.data;
  if (!Array.isArray(data) || data.length === 0) return [];
  return Array.isArray(data[0]) ? data[0] : data;
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export function toListing(p: Raw): RepGoogleListing | null {
  const placeId = typeof p?.place_id === "string" ? p.place_id : null;
  if (!placeId || typeof p.name !== "string") return null;
  return {
    placeId,
    googleId: p.google_id ?? null,
    name: p.name,
    address: p.full_address ?? null,
    site: p.site ?? null,
    rating: typeof p.rating === "number" ? p.rating : null,
    reviews: typeof p.reviews === "number" ? p.reviews : null,
    reviewsPerScore: p.reviews_per_score && typeof p.reviews_per_score === "object" ? p.reviews_per_score : null,
    verified: typeof p.verified === "boolean" ? p.verified : null,
    category: p.category ?? p.type ?? null,
    link: p.location_link ?? p.reviews_link ?? null,
  };
}

/**
 * The business's own Google listing: searched by name (and city when
 * known), kept only when the listing's website is the client's domain.
 * A same-name business elsewhere is never taken as theirs.
 */
export function pickOwnListing(places: Raw[], domain: string): RepGoogleListing | null {
  const want = hostOf(domain);
  if (!want) return null;
  for (const p of places) {
    const site = hostOf(p?.site);
    if (site && (site === want || site.endsWith(`.${want}`))) return toListing(p);
  }
  return null;
}

export async function findGoogleListing(opts: { name: string; domain: string; city?: string | null }): Promise<RepGoogleListing | null> {
  const query = [opts.name, opts.city].filter(Boolean).join(", ");
  if (!query.trim()) return null;
  const body = await outscraper("/google-maps-search", { query, limit: 5 });
  return pickOwnListing(firstQueryRows(body), opts.domain);
}

export interface GoogleReview {
  externalId: string;
  author: string | null;
  rating: number;
  text: string;
  url: string | null;
  publishedAt: string | null;
  ownerAnswered: boolean;
}

/** One review as the reference's example response names its fields. */
export function toGoogleReview(r: Raw): GoogleReview | null {
  const rating = Number(r?.review_rating);
  const text = typeof r?.review_text === "string" ? r.review_text.trim() : "";
  if (!Number.isFinite(rating)) return null;
  const ts = typeof r.review_timestamp === "number" ? r.review_timestamp : null;
  // reviews_id identifies the place, not the review; the review's own id
  // (when present) or its author plus time identifies the review.
  const externalId = (typeof r.review_id === "string" && r.review_id) || (r.author_id && ts ? `${r.author_id}:${ts}` : r.review_link ?? null);
  if (!externalId) return null;
  return {
    externalId: String(externalId),
    author: typeof r.author_title === "string" ? r.author_title : null,
    rating: Math.round(rating),
    text: text || `(${Math.round(rating)} stars, no text)`,
    url: typeof r.review_link === "string" ? r.review_link : null,
    publishedAt: ts ? new Date(ts * 1000).toISOString() : null,
    ownerAnswered: Boolean(r.owner_answer),
  };
}

export async function fetchGoogleReviews(placeId: string, opts: { limit: number; cutoffUnixSeconds?: number }): Promise<{ listing: RepGoogleListing | null; reviews: GoogleReview[] }> {
  const body = await outscraper("/google-maps-reviews", {
    query: placeId,
    reviewsLimit: opts.limit,
    // cutoff forces newest-first per the reference; without it, ask for it.
    ...(opts.cutoffUnixSeconds ? { cutoff: opts.cutoffUnixSeconds } : { sort: "newest" }),
  });
  const place = firstQueryRows(body)[0];
  const reviews = Array.isArray(place?.reviews_data) ? place.reviews_data : [];
  return { listing: place ? toListing(place) : null, reviews: reviews.map(toGoogleReview).filter((r: GoogleReview | null): r is GoogleReview => r !== null) };
}

export interface WebResult {
  externalId: string;
  title: string | null;
  text: string;
  url: string;
  query: string;
  position: number | null;
  posted: string | null;
}

export function toNewsResults(body: Raw, query: string): WebResult[] {
  return firstQueryRows(body)
    .filter((n: Raw) => typeof n?.link === "string")
    .map((n: Raw) => ({
      externalId: n.link,
      title: n.title ?? null,
      text: [n.title, n.body].filter(Boolean).join(": ") || n.link,
      url: n.link,
      query,
      position: typeof n.position === "number" ? n.position : null,
      posted: n.posted ?? null,
    }));
}

export function toSearchResults(body: Raw, query: string): WebResult[] {
  const page = firstQueryRows(body)[0] ?? (Array.isArray(body?.data) ? body.data[0] : null);
  const organic = Array.isArray(page?.organic_results) ? page.organic_results : [];
  return organic
    .filter((o: Raw) => typeof o?.link === "string")
    .map((o: Raw, i: number) => ({
      externalId: o.link,
      title: o.title ?? null,
      text: [o.title, o.description].filter(Boolean).join(": ") || o.link,
      url: o.link,
      query,
      position: i + 1,
      posted: null,
    }));
}

/** Google News for one query; tbs "d" | "w" | "m" limits by date. */
export async function searchNews(query: string, tbs: "d" | "w" | "m" = "w"): Promise<WebResult[]> {
  return toNewsResults(await outscraper("/google-search-news", { query, tbs }), query);
}

/** Google's first page for one query. */
export async function searchGoogle(query: string): Promise<WebResult[]> {
  return toSearchResults(await outscraper("/google-search", { query, pagesPerQuery: 1 }), query);
}
