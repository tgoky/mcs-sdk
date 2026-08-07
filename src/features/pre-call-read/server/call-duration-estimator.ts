// src/features/pre-call-read/server/call-duration-estimator.ts
//
// Assumed-no-show sweep false-positive fix — duration estimate for
// platforms with no verified end-time field.
//
// Calendly's scheduled_events response has a real, confirmed end_time
// field, so NormalizedCall.callEndTime is populated directly from the
// platform for those bookings (see booking.ts). Cal.com, GHL Calendar,
// and OnceHub don't get the same treatment in this pass — not because
// they definitely lack a duration concept, but because none of their
// booking-list endpoints this codebase actually calls were independently
// confirmed to return one, and guessing a field name here is exactly the
// kind of unverified claim this fix exists to stop making.
//
// The workaround: this engagement's own history is real, first-party
// data that's always available and never needs a third-party schema
// assumption. For every past call where a Recall.ai bot actually joined
// and the call didn't resolve as a no-show, `completedAt - callTime` is
// a genuine, measured call length. The median of the last 20 gives a
// reasonable per-engagement estimate of "how long do this client's calls
// actually run" — closer to reality than a single flat number for every
// engagement on every platform, and it improves automatically as more
// calls happen. It's explicitly a statistical estimate, not a fact the
// way Calendly's end_time is, so callers should treat it as a floor for
// "probably still running," not a ceiling for "definitely over."
import { and, desc, eq, isNotNull, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { briefedCallsLog, conversationIntelligenceSessions } from "@/models/schema";
import { RECALL_NO_SHOW_SUB_CODES } from "@/lib/platforms/conversation-intelligence";

const MIN_SAMPLE_SIZE = 3;
const MAX_SAMPLES = 20;
// Sanity bounds on individual samples — guards against outliers (a bot
// left connected to a call room with no one talking, a session that
// processed almost instantly on a fluke) skewing the estimate. Not a
// claim about how long real calls run, just noise-filtering.
const MIN_PLAUSIBLE_MINUTES = 3;
const MAX_PLAUSIBLE_MINUTES = 240;

/**
 * Returns a median duration in minutes from this engagement's own
 * completed Recall sessions, or null when there isn't enough history to
 * say anything ({@link MIN_SAMPLE_SIZE} samples minimum). Null means "no
 * opinion" — callers fall back to a conservative static default, never
 * to zero or to treating the call as already over.
 */
export async function estimateEngagementCallDurationMinutes(engagementId: string): Promise<number | null> {
  const rows = await db
    .select({
      callTime: briefedCallsLog.callTime,
      completedAt: conversationIntelligenceSessions.completedAt,
    })
    .from(conversationIntelligenceSessions)
    .innerJoin(
      briefedCallsLog,
      and(eq(briefedCallsLog.callId, conversationIntelligenceSessions.bookingId), eq(briefedCallsLog.engagementId, engagementId))
    )
    .where(
      and(
        eq(conversationIntelligenceSessions.engagementId, engagementId),
        isNotNull(conversationIntelligenceSessions.completedAt),
        // Exclude sessions Recall itself flagged as no-shows — a near-zero
        // "duration" from an empty room would drag the median down and
        // make the estimate less conservative, exactly backwards from
        // what this function is for.
        notInArray(conversationIntelligenceSessions.subCode, [...RECALL_NO_SHOW_SUB_CODES])
      )
    )
    .orderBy(desc(conversationIntelligenceSessions.completedAt))
    .limit(MAX_SAMPLES);

  const durations = rows
    .map((r) => (r.completedAt!.getTime() - r.callTime.getTime()) / 60000)
    .filter((minutes) => minutes >= MIN_PLAUSIBLE_MINUTES && minutes <= MAX_PLAUSIBLE_MINUTES);

  if (durations.length < MIN_SAMPLE_SIZE) return null;

  durations.sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)];
  return Math.round(median);
}
