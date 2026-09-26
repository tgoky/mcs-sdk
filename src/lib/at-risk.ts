// src/lib/at-risk.ts
//
// When a booked call counts as at risk of a no-show: its estimated show
// chance (show-rate-scorer.ts, a weighted estimate until a model is trained
// on this client's own outcomes) is under the client's threshold, and no
// outcome is in yet. Client-safe: the calendar marks these calls, and
// inngest/at-risk-check-in.ts sends the one extra check-in text.

export const DEFAULT_AT_RISK_THRESHOLD = 50;
/** The check-in text goes this long before the call. */
export const CHECK_IN_HOURS_BEFORE = 3;
/** Too close to the call to be worth a text. */
export const CHECK_IN_MIN_MINUTES_BEFORE = 20;

export const DEFAULT_CHECK_IN_MESSAGE = "Hi {name}, just checking you're still good for our call {time}. Reply YES to confirm, or tell us a better time.";

export function isAtRisk(probability: number | null | undefined, threshold: number | null | undefined, outcome: string | null | undefined): boolean {
  if (probability == null || outcome) return false;
  return probability < (threshold ?? DEFAULT_AT_RISK_THRESHOLD);
}

/** When to send the check-in: CHECK_IN_HOURS_BEFORE the call, or now if
 * that's already passed; null when the call is too close or over. */
export function checkInSendAt(callTime: Date, now: Date): Date | null {
  const minutesLeft = (callTime.getTime() - now.getTime()) / 60_000;
  if (minutesLeft < CHECK_IN_MIN_MINUTES_BEFORE) return null;
  const planned = new Date(callTime.getTime() - CHECK_IN_HOURS_BEFORE * 60 * 60 * 1000);
  return planned > now ? planned : now;
}

/** The text, with the call time in the client's time zone when known. */
export function renderCheckIn(template: string, name: string | null | undefined, callTime: Date, timeZone?: string | null): string {
  let time: string;
  try {
    time = `on ${callTime.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: timeZone || "UTC", timeZoneName: "short" })}`;
  } catch {
    time = `on ${callTime.toUTCString()}`;
  }
  return template.replaceAll("{name}", name?.trim().split(/\s+/)[0] || "there").replaceAll("{time}", time).trim();
}
