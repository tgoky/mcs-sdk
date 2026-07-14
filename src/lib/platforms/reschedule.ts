/**
 * Reschedule mode split — Win-Back recovery gap 3.
 *
 * "time_slots" mode is the existing /reschedule/[engagementId] page:
 * live-fetch open slots and let the prospect pick one. "fresh_link" mode
 * is different in kind, not just presentation — it's the platform's own
 * per-prospect, pre-scoped reschedule URL/UID for the SPECIFIC booking
 * that got cancelled, captured at cancellation time from the webhook
 * payload itself (not fetched after the fact).
 *
 * Platform support is genuinely uneven here:
 *   - Calendly: every invitee payload carries a `reschedule_url` field —
 *     a link straight to rescheduling that exact invitee's event.
 *   - Cal.com: booking payloads carry a `rescheduleUid`, which resolves to
 *     `https://cal.com/reschedule/{uid}` — a real per-booking reschedule
 *     entry point.
 *   - GHL Calendar and OnceHub: neither exposes a per-booking single-use
 *     reschedule identifier in their webhook payloads or REST APIs.
 *     extractFreshRescheduleLink returns null for both — honestly, not as
 *     a bug, there's simply no equivalent primitive to extract. Any
 *     engagement on one of these platforms with reschedule_mode set to
 *     "fresh_link" transparently falls back to "time_slots" per prospect
 *     (see enrollment-service.ts), rather than the operator's chosen mode
 *     silently producing a broken/missing link.
 */

/**
 * Extracts whatever fresh, per-prospect reschedule identifier is
 * available in a booking-cancellation webhook payload. Returns null (not
 * a throw) when the platform doesn't support this or the payload didn't
 * carry one — the caller treats null as "fall back to time_slots for this
 * one prospect."
 */
export function extractFreshRescheduleLink(bookingPlatform: string, payload: any): string | null {
  switch (bookingPlatform) {
    case "calendly": {
      const url: string | undefined = payload?.payload?.reschedule_url ?? payload?.payload?.invitee?.reschedule_url;
      return url ?? null;
    }

    case "cal_com": {
      const uid: string | undefined = payload?.payload?.rescheduleUid ?? payload?.rescheduleUid ?? payload?.payload?.uid;
      return uid ? `https://cal.com/reschedule/${uid}` : null;
    }

    // GHL Calendar and OnceHub: no per-booking reschedule primitive to
    // extract — see module comment above.
    case "ghl_calendar":
    case "oncehub":
    default:
      return null;
  }
}
