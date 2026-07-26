// src/lib/booking-sync-status.ts
//
// Single source of truth for "is this engagement's booking sync actually
// healthy, and does the buyer need to do anything about it." Three
// consumers need the exact same answer and must never drift apart:
//   1. src/lib/queue.ts            — synthesizes an "action needed" queue
//      item when a buyer is on a manual-webhook-only platform and hasn't
//      set one up yet.
//   2. Settings → Booking Sync tab — lists every engagement's status.
//   3. The engagement detail page  — the per-engagement status card.
//
// Verified against the live code, not assumed: registerWebhookForTenant
// (src/lib/platforms/booking.ts) only returns a real subscription id for
// "calendly" and "cal_com" — those two register a push subscription via
// API during onboarding with zero buyer effort. "ghl_calendar" and
// "oncehub" both fall through to `return;` there (GHL v2 Private
// Integrations have no POST /webhooks endpoint at all — confirmed by the
// 404 the old code used to hit; OnceHub's account-level webhook UI/API
// exists but this codebase doesn't call it yet — see the module comment
// on PLATFORMS_REQUIRING_MANUAL_SETUP below), which is why onboarding
// drops those two into webhook_receiver_mode: "polling" automatically.

import type { EngagementStack } from "@/models/schema";

/**
 * Platforms this app cannot register a webhook subscription for via API
 * today, so a buyer on one of these needs to either (a) paste our
 * receiver URL into their own platform's workflow/webhook UI, or (b) stay
 * on polling deliberately. Kept as its own export (not inlined) because
 * three different files need the exact same list.
 *
 * NOTE for a future session: OnceHub shipped an account-level "configure
 * webhooks from the interface, no API needed" flow (their Apr 16 2026
 * changelog) and their Developer Center docs describe a POST-based
 * subscription-create endpoint that returns a signing_secret in the
 * response — the same push-subscription shape CalendlyClient/CalComClient
 * already use. That means true one-click auto-registration for OnceHub is
 * very likely possible now, the same way it already works for Calendly
 * and Cal.com. This file deliberately does NOT attempt that integration
 * yet — the exact current endpoint path, auth header, and request/response
 * schema need to be pulled from OnceHub's live reference docs and verified
 * (the same doc-then-code discipline src/features/notifications/server/
 * credential-health.ts's VALIDATORS comment insists on) before writing an
 * OnceHubClient.subscribeWebhook() method, rather than guessed from a
 * changelog summary. Until that's done, OnceHub stays in the manual/
 * polling bucket below alongside GHL.
 */
export const PLATFORMS_REQUIRING_MANUAL_SETUP = new Set(["ghl_calendar", "oncehub"]);

export function platformSupportsAutoWebhook(platform: string | null | undefined): boolean {
  if (!platform) return false;
  return !PLATFORMS_REQUIRING_MANUAL_SETUP.has(platform);
}

export type SyncHealth = "healthy" | "warning" | "error" | "unconfigured";

export interface BookingSyncStatus {
  platform: string | null;
  mode: "webhook" | "polling" | "none" | "unset";
  /** Does this platform even support us registering a webhook for them? */
  supportsAutoWebhook: boolean;
  health: SyncHealth;
  /** Short label for the colored dot / badge. */
  headline: string;
  /** One sentence of supporting detail under the headline. */
  detail: string;
  lastActivityAt: string | null;
  lastActivityKind: "webhook" | "poll" | null;
  lastError: string | null;
  pollIntervalMinutes: number | null;
  nextPollDueAt: string | null;
  webhookUrl: string;
  hasSigningSecret: boolean;
  /** True only when this engagement should show the "add your webhook" nudge. */
  actionNeeded: boolean;
  dismissed: boolean;
}

function minutesAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

export function buildWebhookReceiverUrl(engagementId: string, appUrl?: string): string {
  const base = appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://mcs-abra.vercel.app";
  return `${base}/api/webhooks/booking-event?engagement_id=${engagementId}`;
}

/**
 * True exactly when a buyer is on a manual-setup-only platform, hasn't
 * switched to webhook mode, and hasn't dismissed the nudge. This is the
 * single predicate the Queue, the settings list, and the per-engagement
 * card all call — changing the rule in one place changes it everywhere.
 */
export function needsWebhookSetupNudge(stack: EngagementStack | null | undefined): boolean {
  if (!stack?.booking_platform) return false;
  if (!PLATFORMS_REQUIRING_MANUAL_SETUP.has(stack.booking_platform)) return false;
  if (stack.webhook_receiver_mode === "webhook") return false;
  if (stack.webhook_receiver_setup_dismissed) return false;
  // Only nudge once there's actually something to connect — no point
  // telling someone to add a webhook before they've even saved their
  // booking platform credentials.
  return Boolean(stack.booking_platform_credentials_ref);
}

export function computeBookingSyncStatus(
  engagementId: string,
  stack: EngagementStack | null | undefined,
  appUrl?: string
): BookingSyncStatus {
  const platform = stack?.booking_platform ?? null;
  const mode = stack?.webhook_receiver_mode ?? "unset";
  const supportsAutoWebhook = platformSupportsAutoWebhook(platform);
  const webhookUrl = buildWebhookReceiverUrl(engagementId, appUrl);
  const dismissed = Boolean(stack?.webhook_receiver_setup_dismissed);
  const actionNeeded = needsWebhookSetupNudge(stack);

  const lastWebhookAt = stack?.webhook_last_received_at ?? null;
  const lastPollAt = stack?.webhook_receiver_last_polled_at ?? null;
  const pollIntervalMinutes = stack?.webhook_poll_interval_minutes ?? 5;

  let lastActivityAt: string | null = null;
  let lastActivityKind: "webhook" | "poll" | null = null;
  if (lastWebhookAt && (!lastPollAt || new Date(lastWebhookAt) > new Date(lastPollAt))) {
    lastActivityAt = lastWebhookAt;
    lastActivityKind = "webhook";
  } else if (lastPollAt) {
    lastActivityAt = lastPollAt;
    lastActivityKind = "poll";
  }

  const nextPollDueAt =
    mode === "polling" && lastPollAt
      ? new Date(new Date(lastPollAt).getTime() + pollIntervalMinutes * 60_000).toISOString()
      : null;

  let health: SyncHealth = "unconfigured";
  let headline = "Not configured";
  let detail = "No booking platform connected yet.";

  if (platform) {
    if (stack?.webhook_last_error) {
      health = "error";
      headline = "Delivery rejected";
      detail = stack.webhook_last_error;
    } else if (mode === "webhook") {
      const ageMin = minutesAgo(lastWebhookAt);
      if (lastWebhookAt && ageMin !== null && ageMin < 60 * 24 * 14) {
        health = "healthy";
        headline = "Direct webhook — live";
        detail = "Bookings are enrolled instantly as they come in.";
      } else if (lastWebhookAt) {
        health = "warning";
        headline = "Direct webhook — quiet";
        detail = "No deliveries in a while. Fine if there haven't been new bookings — worth a test send if you expected one.";
      } else {
        health = "warning";
        headline = "Direct webhook — awaiting first delivery";
        detail = "Configured, but this engagement hasn't received a booking event yet.";
      }
    } else if (mode === "polling") {
      health = supportsAutoWebhook ? "warning" : "warning";
      headline = supportsAutoWebhook ? "Auto-polling (fallback)" : "Auto-polling — instant sync available";
      detail = lastPollAt
        ? `Checking ${platform} every ${pollIntervalMinutes} min for new bookings.`
        : "Will start checking on the next 5-minute cycle.";
    } else if (mode === "none") {
      health = "warning";
      headline = "Manual only";
      detail = "Booking events for this platform aren't tracked automatically.";
    } else {
      health = "unconfigured";
      headline = "Sync mode not set";
      detail = "Save your booking platform credentials to activate sync.";
    }
  }

  return {
    platform,
    mode: mode as BookingSyncStatus["mode"],
    supportsAutoWebhook,
    health,
    headline,
    detail,
    lastActivityAt,
    lastActivityKind,
    lastError: stack?.webhook_last_error ?? null,
    pollIntervalMinutes: mode === "polling" ? pollIntervalMinutes : null,
    nextPollDueAt,
    webhookUrl,
    hasSigningSecret: Boolean(stack?.webhook_signing_secret),
    actionNeeded,
    dismissed,
  };
}
