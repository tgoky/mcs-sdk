// src/lib/booking-sync-status.ts
import type { EngagementStack } from "@/models/schema";

export const PLATFORMS_REQUIRING_MANUAL_SETUP = new Set(["ghl_calendar", "oncehub"]);

export function platformSupportsAutoWebhook(platform: string | null | undefined): boolean {
  if (!platform) return false;
  return !PLATFORMS_REQUIRING_MANUAL_SETUP.has(platform);
}

export type SyncHealth = "healthy" | "warning" | "error" | "unconfigured";

export interface BookingSyncStatus {
  platform: string | null;
  mode: "webhook" | "polling" | "none" | "unset";
  supportsAutoWebhook: boolean;
  health: SyncHealth;
  headline: string;
  detail: string;
  lastActivityAt: string | null;
  lastActivityKind: "webhook" | "poll" | null;
  lastError: string | null;
  pollIntervalMinutes: number | null;
  nextPollDueAt: string | null;
  webhookUrl: string;
  hasSigningSecret: boolean;
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

export function needsWebhookSetupNudge(stack: EngagementStack | null | undefined): boolean {
  if (!stack?.booking_platform) return false;
  if (!PLATFORMS_REQUIRING_MANUAL_SETUP.has(stack.booking_platform)) return false;
  if (stack.webhook_receiver_mode === "webhook") return false;
  if (stack.webhook_receiver_setup_dismissed) return false;
  return Boolean(stack.booking_platform_credentials_ref);
}

export function computeBookingSyncStatus(
  engagementId: string,
  stack: EngagementStack | null | undefined,
  appUrl?: string
): BookingSyncStatus {
  const platform = stack?.booking_platform ?? null;
  const rawMode = stack?.webhook_receiver_mode;
  const supportsAutoWebhook = platformSupportsAutoWebhook(platform);

  // Default manual-setup platforms (GHL Calendar, OnceHub) to "polling" when mode is unset/empty
  const mode =
    rawMode && rawMode !== ("unset" as any)
      ? rawMode
      : platform && !supportsAutoWebhook
      ? "polling"
      : "unset";

  const webhookUrl = buildWebhookReceiverUrl(engagementId, appUrl);
  const dismissed = Boolean(stack?.webhook_receiver_setup_dismissed);
  const actionNeeded = needsWebhookSetupNudge(stack);

  const lastWebhookAt = stack?.webhook_last_received_at ?? null;
  const lastPollAt = stack?.webhook_receiver_last_polled_at ?? null;
  const pollIntervalMinutes = stack?.webhook_poll_interval_minutes ?? 25;

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
      // Reused for both delivery paths — the message itself already says
      // "Poll failed..." vs a signature-check failure, so the headline
      // just needs to be generic enough to cover either source.
      headline = mode === "polling" ? "Sync error" : "Delivery rejected";
      detail = stack.webhook_last_error;
    } else if (mode === "webhook") {
      const ageMin = minutesAgo(lastWebhookAt);
      if (lastWebhookAt && ageMin !== null && ageMin < 60 * 24 * 14) {
        health = "healthy";
        headline = "Direct webhook · live";
        detail = "Bookings are enrolled instantly as they come in.";
      } else if (lastWebhookAt) {
        health = "warning";
        headline = "Direct webhook · quiet";
        detail = "No deliveries in a while. Fine if there haven't been new bookings.";
      } else {
        health = "warning";
        headline = "Direct webhook · awaiting first delivery";
        detail = "Configured, but this engagement hasn't received a booking event yet.";
      }
    } else if (mode === "polling") {
      const pollAgeMin = minutesAgo(lastPollAt);
      // Bug fix (2026-08-20): this branch used to report "healthy" purely
      // from mode === "polling", with no check on whether a poll had
      // actually run recently. If this engagement fell out of the cron's
      // due-list (or the cron itself stopped), the card kept claiming
      // "Checking every N min" indefinitely with nothing to contradict it.
      // A poll is due every pollIntervalMinutes; missing that by more than
      // 3x is a real signal something upstream stopped, not normal jitter.
      if (lastPollAt && pollAgeMin !== null && pollAgeMin > pollIntervalMinutes * 3) {
        health = "error";
        headline = "Auto-polling · stalled";
        detail = `Last checked ${Math.round(pollAgeMin)} min ago — expected every ${pollIntervalMinutes} min. The poll cycle may have stopped; if this doesn't clear on its own, check credentials in Settings → Booking Sync.`;
      } else {
        health = "warning";
        headline = supportsAutoWebhook ? "Auto-polling (fallback)" : "Auto-polling · instant sync available";
        detail = lastPollAt
          ? `Checking every ${pollIntervalMinutes} min for new bookings.`
          : "Will start checking on the next 5-minute cycle.";
      }
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