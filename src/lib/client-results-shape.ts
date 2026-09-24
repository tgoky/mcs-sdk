// src/lib/client-results-shape.ts
//
// The shapes of a client's results (features/reports/server/client-results.ts
// reads them), kept apart from the queries so client components can use
// them without pulling in the database.

export const RESULTS_WINDOW_DAYS = 30;

export interface RawCounts {
  booked: number;
  showed: number;
  noShow: number;
  winBackRebooked: number;
  winBackLost: number;
  textLatenciesMs: number[];
  contacted: number;
  humanReplies: number;
  interested: number;
  newReviews: number;
  ratingSum: number;
  ratingCount: number;
  badReviews: number;
  badAnswered: number;
  mentions: number;
  negativeMentions: number;
  incidents: number;
  saveOffersSent: number;
  membersStayed: number;
  disputesAnswered: number;
}

export type Product = "showtime" | "cold-open" | "reputation" | "whop";
export type MetricFormat = "count" | "percent" | "duration" | "rating";

export interface Metric {
  key: string;
  label: string;
  current: number | null;
  previous: number | null;
  format: MetricFormat;
  /** Which way is good. */
  better: "up" | "down";
}

export interface ProductResults {
  product: Product;
  metrics: Metric[];
}

export interface ShowRateThenNow {
  /** Show rate over the client's first month of recorded outcomes. */
  baseline: number;
  current: number;
  /** Extra shows in the window at the current rate vs the baseline. */
  extraShows: number;
  /** extraShows at the offer price, only when a price is on file. */
  estimatedValue: number | null;
  offerPrice: string | null;
}

export interface ClientResults {
  engagementId: string;
  buyer: string;
  current: RawCounts;
  previous: RawCounts;
  products: ProductResults[];
  showRate: ShowRateThenNow | null;
}
