// src/lib/whop-setup/probe-labels.ts
//
// What each row of the connect probe unlocks, in plain words. Client-safe.

export const PROBE_LABELS: Record<string, { label: string; locksWhat: string }> = {
  accounts: { label: "Account access", locksWhat: "Everything. The key has no usable Whop account." },
  products: { label: "Products", locksWhat: "Product launches and reading your catalog" },
  plans: { label: "Plans", locksWhat: "Pricing, the cancel discount and promo codes" },
  memberships: { label: "Memberships", locksWhat: "Member counts and who is cancelling" },
  stats: { label: "Stats", locksWhat: "Revenue reports and rate alerts" },
  webhooks: { label: "Webhooks", locksWhat: "The save offer, dispute response, daily digest and bridge" },
  disputes: { label: "Disputes", locksWhat: "Dispute response" },
  dispute_alerts: { label: "Dispute alerts", locksWhat: "Early dispute warnings" },
  payments: { label: "Payments (elevated)", locksWhat: "Payment-level detail. Standard keys don't have it." },
  affiliates: { label: "Affiliates", locksWhat: "The affiliate report" },
  chat_channels: { label: "Chat channels", locksWhat: "Community reads" },
  dm_channels: { label: "DM channels", locksWhat: "Optional community features" },
  support_channels: { label: "Support channels", locksWhat: "Optional support features" },
  app_users: { label: "Key type check", locksWhat: "Nothing. It only tells a bot key from an app key." },
  memberships_v2: { label: "Attribution (v2 API)", locksWhat: "The attribution report" },
};

/** Probe rows expected to stay locked on a standard key, so they aren't shown as problems. */
export const EXPECTED_LOCKED = new Set(["payments", "app_users", "dm_channels", "support_channels", "chat_channels"]);
