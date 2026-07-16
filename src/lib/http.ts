/**
 * Drop-in replacement for `fetch()` that always has a timeout.
 *
 * The AI Architect Review flagged that none of the external platform
 * calls (Twilio, Calendly, Cal.com, Klaviyo, HubSpot, GHL, ActiveCampaign,
 * Mailchimp, ConvertKit, Hyros, Vidalytics, Wistia, YouTube, hosting
 * deploy targets, etc.) had any timeout — a hanging call to any one of
 * them would hold a serverless function open until the platform's own
 * hard ceiling killed it, which is exactly what the stale-run reaper
 * (src/lib/run-log.ts's timeoutRun) exists to clean up after at the run
 * level, but does nothing to stop a single fetch from hanging for minutes
 * first.
 *
 * Same signature as `fetch`, so existing call sites only need
 * `fetch(...)` renamed to `fetchWithTimeout(...)` plus the import — no
 * argument changes. If a caller already supplies its own `signal` (e.g.
 * a caller-managed AbortController for a longer-running operation), that
 * signal is respected as-is rather than layering a second one on top.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  if (init.signal) {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
