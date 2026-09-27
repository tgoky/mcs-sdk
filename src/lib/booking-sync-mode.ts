// src/lib/booking-sync-mode.ts
//
// Switching how a client's new bookings come in: checked on a schedule
// ("polling") or pushed by the booking tool ("webhook"). Shared by the
// sync-mode route and a skill's Configure, so both switch the same way.
//
// Switching to webhook makes the signing secret the booking tool signs
// with (never replacing one that exists: it may already be pasted in).
// Switching to polling, or changing how often, rewinds the watermark one
// interval so the first check looks back that far, not the whole history.

import crypto from "crypto";
import type { EngagementStack } from "@/models/schema";
import { getSigningSecret, setSigningSecret } from "@/lib/signing-secrets";

export const DEFAULT_POLL_INTERVAL_MINUTES = 25;

export async function bookingSyncPatch(
  engagementId: string,
  stack: Partial<EngagementStack>,
  opts: { mode?: "webhook" | "polling"; pollIntervalMinutes?: number; dismissSetupNudge?: boolean }
): Promise<{ patch: Partial<EngagementStack>; signingSecret: string | null }> {
  const patch: Partial<EngagementStack> = {};
  let signingSecret = await getSigningSecret(engagementId, "booking_webhook");

  if (opts.mode === "webhook") {
    if (!signingSecret) {
      signingSecret = crypto.randomBytes(32).toString("hex");
      await setSigningSecret(engagementId, "booking_webhook", signingSecret);
      patch.webhook_signing_secret_set = true;
    }
    patch.webhook_receiver_mode = "webhook";
  } else if (opts.mode === "polling") {
    const intervalMinutes = opts.pollIntervalMinutes ?? stack.webhook_poll_interval_minutes ?? DEFAULT_POLL_INTERVAL_MINUTES;
    patch.webhook_receiver_mode = "polling";
    patch.webhook_poll_interval_minutes = intervalMinutes;
    patch.webhook_receiver_last_polled_at = new Date(Date.now() - intervalMinutes * 60_000).toISOString();
  } else if (opts.pollIntervalMinutes !== undefined && stack.webhook_receiver_mode === "polling") {
    patch.webhook_poll_interval_minutes = opts.pollIntervalMinutes;
    patch.webhook_receiver_last_polled_at = new Date(Date.now() - opts.pollIntervalMinutes * 60_000).toISOString();
  }

  if (opts.dismissSetupNudge) patch.webhook_receiver_setup_dismissed = true;
  // Choosing webhook resolves the nudge; a later switch back shows it fresh.
  else if (opts.mode === "webhook") patch.webhook_receiver_setup_dismissed = false;

  return { patch, signingSecret };
}
