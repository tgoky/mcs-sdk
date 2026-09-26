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
  /** Failed payments that were paid after the recovery message (Whop's record). */
  paymentsRecovered: number;
  /** Review requests sent (delivered per the provider where it reports). */
  reviewRequestsSent: number;
  /** New Google reviews whose author's full name matches someone asked in the 30 days before. */
  reviewsAfterAsking: number;
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
  /** Reminded vs held-out show rate, while the client runs a holdout (lib/reminder-holdout.ts). */
  holdout: HoldoutComparison | null;
}

export interface HoldoutComparison {
  reminded: { showed: number; total: number };
  heldOut: { showed: number; total: number };
  /** Show-rate points the reminders added; null until both sides have enough outcomes. */
  liftPoints: number | null;
}

/** What the products a client has on did together in the window: the
 * journey from first email to money (features/reports/server/connected-results.ts).
 * A stage is present only when the product that sees it is on. */
export interface ConnectedResults {
  products: ("cold-open" | "showtime" | "whop-agent" | "reputation-manager")[];
  funnel: { emailed?: number; replied?: number; booked?: number; showed?: number; paid?: number };
  /** Whop payments in the window, in the client's main currency. */
  money: { collected: number; refunded: number; kept: number; currency: string; payments: number } | null;
  /** Bookings by people Cold Open emailed (Cold Open + Showtime on). */
  fromColdOpen: { booked: number; showed: number; paid: number; value: number | null } | null;
  /** Buyers who paid after showing up to a call (Showtime + Whop on). */
  paidAfterCall: { buyers: number; value: number } | null;
  /** Each Cold Open campaign carried through to calls and money. */
  campaigns: { campaignId: string; emailed: number; booked: number; showed: number; paid: number; value: number | null }[];
}
