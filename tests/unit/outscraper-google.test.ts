import { describe, it, expect } from "vitest";
import { firstQueryRows, pickOwnListing, toGoogleReview, toNewsResults, toSearchResults } from "@/features/reputation-manager/server/outscraper-google";

// Shapes copied from Outscraper's API reference examples.
const mapsSearch = {
  status: "Success",
  data: [
    [
      { name: "Acme Salon", place_id: "ChIJother", site: "https://acme-salon.co.uk/", rating: 4.1, reviews: 90 },
      { name: "Acme", place_id: "ChIJacme", google_id: "0x1:0x2", site: "https://www.acme.com/?utm_source=Google+My+Business", rating: 4.7, reviews: 212, reviews_per_score: { "1": 9, "5": 180 }, verified: true, full_address: "1 Main St" },
    ],
  ],
};

describe("pickOwnListing", () => {
  it("takes only the listing whose website is the client's domain", () => {
    const l = pickOwnListing(firstQueryRows(mapsSearch), "acme.com");
    expect(l).toMatchObject({ placeId: "ChIJacme", name: "Acme", rating: 4.7, reviews: 212, verified: true, address: "1 Main St" });
    expect(l?.reviewsPerScore?.["1"]).toBe(9);
  });
  it("returns nothing rather than a same-name business elsewhere", () => {
    expect(pickOwnListing(firstQueryRows(mapsSearch), "acme.io")).toBeNull();
  });
});

describe("toGoogleReview", () => {
  it("reads a review, its own id from the author and time, and whether the owner replied", () => {
    const r = toGoogleReview({
      author_title: "Dong Kyu Kim",
      author_id: "100439884166244262419",
      review_text: "Great views.",
      review_rating: 5,
      review_timestamp: 1611152718,
      review_link: "https://www.google.com/maps/reviews/x",
      owner_answer: null,
      reviews_id: "-1403893626557371920",
    });
    expect(r).toEqual({
      externalId: "100439884166244262419:1611152718",
      author: "Dong Kyu Kim",
      rating: 5,
      text: "Great views.",
      url: "https://www.google.com/maps/reviews/x",
      publishedAt: new Date(1611152718 * 1000).toISOString(),
      ownerAnswered: false,
    });
    expect(toGoogleReview({ review_rating: 1, author_id: "a", review_timestamp: 1, owner_answer: "Sorry!" })?.ownerAnswered).toBe(true);
    expect(toGoogleReview({ review_rating: 2, author_id: "a", review_timestamp: 1 })?.text).toBe("(2 stars, no text)");
  });
});

describe("news and search results", () => {
  it("reads Google News rows per the reference example", () => {
    const body = { data: [[{ query: "acme", position: 1, title: "Acme raises", body: "Funding news", posted: "1 hour ago", link: "https://news.example/acme" }]] };
    expect(toNewsResults(body, '"Acme"')).toEqual([
      { externalId: "https://news.example/acme", title: "Acme raises", text: "Acme raises: Funding news", url: "https://news.example/acme", query: '"Acme"', position: 1, posted: "1 hour ago" },
    ]);
  });
  it("reads Google's organic results with their rank", () => {
    const body = { data: [{ query: "acme reviews", organic_results: [{ link: "https://a.example", title: "A", description: "one" }, { link: "https://b.example", title: "B", description: "two" }] }] };
    const out = toSearchResults(body, "acme reviews");
    expect(out.map((r) => [r.url, r.position])).toEqual([
      ["https://a.example", 1],
      ["https://b.example", 2],
    ]);
  });
});
