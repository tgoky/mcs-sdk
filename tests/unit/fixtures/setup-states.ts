// Setup states the review and settings tests render: a website-only Cold
// Open, a connected Whop business, and a Reputation Manager read.

import type { ColdOpenSetupState } from "@/lib/cold-open-setup/types";
import type { WhopSetupState } from "@/lib/whop-setup/types";
import type { RepSetupState } from "@/lib/rep-setup/types";

// Website only, Showtime already set up, nothing connected: the case that
// used to come back as a blank form.
export const coldOpenState: ColdOpenSetupState = {
  engagementId: "e1",
  buyer: "Mudd1s",
  configured: true,
  skills: { "daily-send": true, "reply-sort": true, "send-report": true } as ColdOpenSetupState["skills"],
  website: { domain: "muddventures.com", readAt: "2026-09-24T00:00:00Z" },
  tools: [],
  crm: null,
  outbound: null,
  buyers: null,
  leadSources: [],
  proposal: {
    product: {
      name: { value: "AI Clarity Call", tier: "done", source: "your Showtime setup" },
      url: { value: "https://muddventures.com", tier: "done", source: "your website" },
      price: { value: "$500", tier: "done", source: "your Showtime setup" },
      valueProp: { value: "AI Clarity Call for Agency owners", tier: "likely", source: "your Showtime setup" },
    },
    icps: [{ slug: "agency-owners", label: "Agency owners", weight: 1, teamSizeMin: null, teamSizeMax: null, disqualifyIf: [], tier: "likely", evidence: "From your Showtime setup" }],
    voice: {
      greeting: { value: "Hi", tier: "likely", source: "a common default" },
      signOff: { value: "Best,", tier: "likely", source: "a common default" },
      tone: { value: "Plain and friendly", tier: "likely", source: "a common default" },
    },
    subjects: [],
    touchsets: [],
    touchsetsDropped: 0,
    platform: null,
    campaignMap: { "agency-owners": null },
    daily: { volume: 20, localHour: 9, timezone: null, copyMode: "generate", liveSendEnabled: false, volumeSource: "a careful starting point" },
  },
};

export const whopState: WhopSetupState = {
  engagementId: "e1",
  buyer: "Mudd1s",
  connection: { connected: true, accountId: "biz_1", credentialType: "company_api_key", pinnedVersionDate: "2026-01-01", locked: [], breakerOpen: false },
  configured: true,
  skills: { "whop-cancellation-save-offer": true, "whop-refund-dispute-velocity": true, "whop-bridge-manager": false },
  read: {
    accountId: "biz_1",
    readAt: "2026-09-20T00:00:00Z",
    plans: [{ id: "p1", title: "Pro", productTitle: "Pro", planType: "renewal", visibility: "visible", currency: "usd", initialPrice: 0, renewalPrice: 49, formattedPrice: "$49/mo", billingPeriodDays: 30, trialDays: null, memberCount: 120, cancelDiscount: null }],
    products: [{ id: "prod1", title: "Pro", memberCount: 120, rating: null, reviews: null }],
    canceling: { count: 4, more: false, reasons: ["Too expensive"], periodEnds: [] },
    newMembers30d: { count: 10, more: false },
    disputes90d: null,
    disputeAlerts90d: null,
    refunds90d: null,
    promoCodes: [],
    affiliates: [],
    reviews: [],
    webhooks: [],
    metrics: [],
    coverage: { read: [], blocked: [], failed: [] },
  },
  snapshot: { mrr: { value: 5880, currency: "usd", source: "stats" }, members: 120, canceling: { count: 4, more: false }, newMembers30d: { count: 10, more: false }, refundRate: 0.02, disputeRate: 0.004, payments90d: 300, churn: 0.03 },
  saveOffer: { discount: null, months: null, message: "", minTenureDays: 30, cooldownDays: 90, source: null, evidence: [] },
  alerts: { refundRate: 0.08, disputeRate: 0.0075, alertThreshold: 3, minSample: 20, why: { refund: "Your refunds ran 2% over 90 days.", dispute: "Disputes ran 0.4%.", alerts: "None in 90 days.", sample: "About 23 payments a week." }, fromData: true, saved: false },
  bridge: { url: "", ghlConnected: false, signingSecret: null },
  webhook: { current: null, receiverUrl: "https://example.com/hook", problems: [] },
};

export const item = (value: string, tier: "done" | "likely" = "done") => ({ value, sources: ["your website"], tier, on: true });
export const repState: RepSetupState = {
  engagementId: "e1",
  buyer: "Mudd1s",
  configured: false,
  skills: {},
  website: { domain: "muddventures.com", readAt: "2026-09-20T00:00:00Z" },
  tools: [],
  whop: { linked: false, connectHref: "/x" },
  proposal: {
    operatorName: { value: "Mudd Ventures", tier: "done", source: "your website" },
    aliases: [item("Mudd")],
    domains: [item("muddventures.com")],
    emailContacts: [item("hi@muddventures.com")],
    handles: [{ platform: "x", handle: "@mudd", sources: ["your website"], tier: "done", on: true }],
    entities: [{ ...item("Mudd Ventures"), type: "company", highPriority: true }],
    offerings: [item("AI Clarity Call")],
    competitors: [item("Acme", "likely")],
    collisions: [],
    trustedSources: [],
    seedPrompts: [item("Is Mudd Ventures legit?")],
    soleAuthority: { saved: null, suggestion: { name: "Ada Mudd", role: "Founder", source: "your website" } },
    googleListing: null,
  },
  firstLook: null,
  engines: { active: null, available: ["chatgpt", "claude"] },
  crisisThreshold: null,
  operatorPagePhone: null,
};
