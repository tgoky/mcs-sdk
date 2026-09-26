// src/lib/whop-setup/types.ts
//
// What Whop Agent's setup reads and shows. Client-safe.

export interface WhopMetric {
  id: "mrr" | "churn" | "payments";
  key: string;
  name: string;
  unit: string;
  /** A count summed over the window, or a level's latest value. A
   * percent is a fraction here (Whop's 1.6 means 1.6%, stored as 0.016). */
  value: number;
  days: number;
  currency: string | null;
}

export interface WhopPlanRead {
  id: string;
  title: string | null;
  productTitle: string | null;
  planType: string | null;
  visibility: string | null;
  currency: string | null;
  initialPrice: number | null;
  renewalPrice: number | null;
  formattedPrice: string | null;
  billingPeriodDays: number | null;
  trialDays: number | null;
  memberCount: number | null;
  /** Whop's own cancel discount, when the plan already offers one. */
  cancelDiscount: { percentage: number; intervals: number | null } | null;
}

export interface Counted {
  count: number;
  /** More exist than were read. */
  more: boolean;
}

export interface WhopAccountRead {
  accountId: string;
  readAt: string;
  plans: WhopPlanRead[];
  products: { id: string; title: string; memberCount: number | null; rating: number | null; reviews: number | null }[];
  canceling: (Counted & { reasons: string[]; periodEnds: string[] }) | null;
  newMembers30d: Counted | null;
  disputes90d: { total: number; byStatus: Record<string, number> | null } | null;
  disputeAlerts90d: Counted | null;
  refunds90d: Counted | null;
  promoCodes: { code: string | null; uses: number; amountOff: number | null; promoType: string | null; churnedOnly: boolean }[] | null;
  affiliates: { name: string | null; referrals: number; revenueUsd: number }[] | null;
  reviews: { product: string; stars: number; title: string | null; text: string | null; at: string | null }[];
  webhooks: { id: string; url: string; events: string[]; enabled: boolean; apiVersionDate: string | null; failures: number; disabledReason: string | null }[] | null;
  metrics: WhopMetric[];
  coverage: { read: string[]; blocked: string[]; failed: string[] };
}

export interface Snapshot {
  mrr: { value: number; currency: string; source: "stats" | "plans" } | null;
  members: number | null;
  canceling: Counted | null;
  newMembers30d: Counted | null;
  refundRate: number | null;
  disputeRate: number | null;
  payments90d: number | null;
  churn: number | null;
}

export interface AlertProposal {
  /** Fractions of payments over a rolling 7 days. */
  refundRate: number;
  disputeRate: number;
  alertThreshold: number;
  minSample: number;
  /** How each number was worked out, in plain words. */
  why: { refund: string; dispute: string; alerts: string; sample: string };
  fromData: boolean;
}

export interface WhopSetupState {
  engagementId: string;
  buyer: string;
  connection: {
    connected: boolean;
    accountId: string | null;
    credentialType: string | null;
    pinnedVersionDate: string | null;
    /** Probe rows that didn't unlock, with what they hold back. */
    locked: { label: string; locks: string }[];
    breakerOpen: boolean;
  };
  configured: boolean;
  skills: Record<string, boolean>;
  read: WhopAccountRead | null;
  snapshot: Snapshot | null;
  saveOffer: {
    discount: number | null;
    months: number | null;
    message: string;
    minTenureDays: number | null;
    cooldownDays: number | null;
    /** Where a pre-filled discount came from, when not saved. */
    source: string | null;
    evidence: string[];
  };
  alerts: AlertProposal & { saved: boolean };
  /** Failed-payment recovery's message: the client's own, or null for the default shown. */
  recovery: { message: string | null; defaultMessage: string };
  /** signingSecret: shown once a destination is saved, so it can check X-Whop-Agent-Signature. */
  /** fieldMapping: renames Whop's field names in what's forwarded (Whop name -> theirs). */
  bridge: { url: string; ghlConnected: boolean; signingSecret: string | null; fieldMapping: Record<string, string> };
  webhook: {
    /** Events the agent's own subscription carries now. */
    current: string[] | null;
    receiverUrl: string;
    problems: { kind: "duplicate" | "unpinned" | "failing"; detail: string; groupKey?: string; whopWebhookId?: string }[];
  };
}
