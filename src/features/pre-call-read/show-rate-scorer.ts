// src/features/pre-call-read/server/show-rate-scorer.ts
//
// Tier 4 #25 — predictive show-rate scoring.
//
// Important honesty note, read before wiring this into anything
// buyer-facing: this is a documented, interpretable WEIGHTED HEURISTIC,
// not a trained classifier. A real trained model needs (features,
// actual_outcome) pairs to fit against — this app has none yet, because
// nothing tracked actual call outcomes until this pass (see
// showRateFeatures.actualOutcome, backfilled by the Slack brief-outcome
// buttons at src/app/api/webhooks/slack/interactions/route.ts, or
// whatever else eventually marks a booking's disposition). The weights
// below are directionally reasonable — drawn from commonly-cited general
// no-show/CRM patterns (short lead time, off-hours bookings, and prior
// no-show history are the most consistently reported predictors across
// that literature) — but they are NOT fit to this app's own historical
// data, because that data doesn't exist yet.
//
// The honest scope for this pass is: (1) ship an interpretable score that
// gives a rep a rough prior worth glancing at, and (2) start the
// showRateFeatures logging table so that in a few months, once enough
// actualOutcome-labeled rows exist, someone can replace scoreShowRate's
// body with a real fitted model (logistic regression on these same
// features would be a reasonable first upgrade) without touching any
// call site. Do not present this score to a buyer as validated/backtested
// — it isn't yet.
import { db } from "@/lib/db";
import { winBackEnrollments, briefedCallsLog, showRateFeatures } from "@/models/schema";
import { and, eq } from "drizzle-orm";

export interface ShowRateFeatures {
  personMatchScore?: number;
  leadTimeHours?: number;
  bookingHourLocal?: number;
  bookingDayOfWeek?: number;
  isConsumerEmailDomain?: boolean;
  priorNoShowCount?: number;
  priorShowCount?: number;
  emailEngagementScore?: number;
  applicationCompletenessRatio?: number;
}

const CONSUMER_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com", "live.com", "protonmail.com",
]);

/**
 * Gathers the features this pass can actually derive from existing data.
 * emailEngagementScore and applicationCompletenessRatio are left
 * undefined when the caller doesn't have them — scoreShowRate treats a
 * missing feature as "no signal," not "worst case," so a partial feature
 * set still produces a reasonable score.
 */
export async function deriveShowRateFeatures(input: {
  engagementId: string;
  prospectEmail: string;
  prospectName?: string;
  callTime: Date;
  personMatchScore?: number;
  emailEngagementScore?: number; // 0-1, pass through from getProfileEngagement's event count if the caller has already fetched it
  applicationCompletenessRatio?: number;
  now?: Date;
}): Promise<ShowRateFeatures> {
  const now = input.now ?? new Date();
  const leadTimeHours = Math.max(0, (input.callTime.getTime() - now.getTime()) / (1000 * 60 * 60));
  const domain = input.prospectEmail.split("@")[1]?.toLowerCase();

  // Approximation, documented rather than hidden: a prior Win-Back
  // enrollment for this email on this engagement means they were
  // previously flagged no-showed or cancelled (that's the only thing that
  // creates a winBackEnrollments row) — a real "no_show" tag per booking
  // doesn't exist independently of that table yet.
  //
  // priorShowCount is weaker still: briefedCallsLog doesn't store
  // prospect email at all, only prospectName (see that table's schema) —
  // so this can only match on name, which isn't a unique identifier and
  // will both miss real matches (name entered differently across
  // bookings) and occasionally over-match (two different prospects
  // sharing a name). Skipped entirely (left undefined, not silently
  // wrong) when the caller doesn't have a name to match on. A cleaner fix
  // is adding a prospectEmail column to briefedCallsLog — a reasonable
  // small follow-up, not done here to keep this change scoped to scoring.
  const winBackRows = await db
    .select({ id: winBackEnrollments.id })
    .from(winBackEnrollments)
    .where(and(eq(winBackEnrollments.engagementId, input.engagementId), eq(winBackEnrollments.prospectEmail, input.prospectEmail)));

  let priorShowCount: number | undefined;
  if (input.prospectName) {
    const briefedRows = await db
      .select({ id: briefedCallsLog.id })
      .from(briefedCallsLog)
      .where(and(eq(briefedCallsLog.engagementId, input.engagementId), eq(briefedCallsLog.prospectName, input.prospectName)));
    priorShowCount = Math.max(0, briefedRows.length - winBackRows.length);
  }

  return {
    personMatchScore: input.personMatchScore,
    leadTimeHours,
    bookingHourLocal: input.callTime.getHours(),
    bookingDayOfWeek: input.callTime.getDay(),
    isConsumerEmailDomain: domain ? CONSUMER_EMAIL_DOMAINS.has(domain) : undefined,
    priorNoShowCount: winBackRows.length,
    priorShowCount,
    emailEngagementScore: input.emailEngagementScore,
    applicationCompletenessRatio: input.applicationCompletenessRatio,
  };
}

/**
 * The heuristic itself — see the module header before trusting these
 * weights as anything more than a rough, interpretable prior. Every term
 * is a no-op when its underlying feature is undefined, so a partial
 * feature set degrades gracefully rather than skewing toward either
 * extreme.
 */
export function scoreShowRate(features: ShowRateFeatures): number {
  let score = 70; // baseline assumed show rate for a generic warm-lead booking

  if (features.personMatchScore !== undefined) {
    score += (features.personMatchScore - 70) * 0.1;
  }

  if (features.leadTimeHours !== undefined) {
    if (features.leadTimeHours < 2) score -= 15; // booked-and-called almost immediately — often a low-commitment click
    else if (features.leadTimeHours > 336) score -= 10; // booked >14 days out — plenty of time to lose interest or forget
    else if (features.leadTimeHours >= 24 && features.leadTimeHours <= 96) score += 5; // 1-4 days out is the commonly-cited sweet spot
  }

  if (features.bookingDayOfWeek === 0 || features.bookingDayOfWeek === 6) score -= 8; // weekend calls
  if (features.bookingHourLocal !== undefined && (features.bookingHourLocal < 8 || features.bookingHourLocal > 18)) {
    score -= 5; // off-hours booking
  }

  if (features.isConsumerEmailDomain) score -= 3; // weak proxy for lower-commitment signup, not a strong signal on its own

  if (features.priorNoShowCount) score -= Math.min(30, features.priorNoShowCount * 15); // strongest single predictor in the general literature
  if (features.priorShowCount) score += Math.min(15, features.priorShowCount * 5);

  if (features.emailEngagementScore !== undefined) score += features.emailEngagementScore * 10;

  return Math.max(5, Math.min(95, Math.round(score)));
}

/** Logs a scored call — this row is both the audit trail for the score that shipped on a brief and, once actualOutcome is backfilled, training data for a future real model. */
export async function logShowRateFeatures(input: {
  engagementId: string;
  bookingId: string;
  prospectEmail: string;
  features: ShowRateFeatures;
  predictedShowProbability: number;
}): Promise<void> {
  await db.insert(showRateFeatures).values({
    engagementId: input.engagementId,
    bookingId: input.bookingId,
    prospectEmail: input.prospectEmail,
    features: input.features,
    predictedShowProbability: input.predictedShowProbability,
  });
}
