// src/features/win-back/server/revenue-attribution.ts
//
// Tier 4 #26 — revenue-attribution dashboard. The AI Architect Review's
// own framing for this is the reason it's worth building even though it's
// listed last in the roadmap: "Win-Back recovered $84,000 this quarter" is
// the single sentence that turns "a background service is running" into
// something an operator can put in front of a buyer as proof of value.
// Every number here is provable from data this app already has — this
// module just does the join + arithmetic, once, in one place, instead of
// leaving every dashboard screen that wants this number to reinvent it
// slightly differently.
import { db } from "@/lib/db";
import { winBackEnrollments, engagements } from "@/models/schema";
import { and, eq, gte } from "drizzle-orm";

export interface RecoveredEnrollmentSummary {
  prospectEmail: string;
  prospectName: string | null;
  rebookedAt: string;
}

export interface RevenueAttributionResult {
  engagementId: string;
  periodLabel: string;
  sinceIso: string;
  offerPrice: number;
  recoveredCount: number;
  totalRevenue: number;
  averageRecoveryValue: number;
  recoveredEnrollments: RecoveredEnrollmentSummary[];
}

/** Same tolerant price parsing script-builder.ts's selectHeroApproach already uses — offerDetails.price is free-text ("$5,000", "5000", "$5k") entered at onboarding, not a validated number. */
function parseOfferPrice(price: string | undefined): number {
  if (!price) return 0;
  const cleaned = String(price).replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

/** Defaults to the start of the current calendar quarter — "this quarter" is the framing the AI Architect Review's example sentence uses, and it's the natural default for a recurring dashboard card. Pass an explicit `since` for a custom window (e.g. "since this engagement started"). */
function currentQuarterStart(): Date {
  const now = new Date();
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
  return new Date(now.getFullYear(), quarterStartMonth, 1);
}

function quarterLabel(d: Date): string {
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}

export async function computeWinBackRevenueAttribution(
  engagementId: string,
  since?: Date
): Promise<RevenueAttributionResult> {
  const sinceDate = since ?? currentQuarterStart();

  const [engagement] = await db
    .select({ offerDetails: engagements.offerDetails })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);

  const offerPrice = parseOfferPrice(engagement?.offerDetails?.price);

  const recovered = await db
    .select({
      prospectEmail: winBackEnrollments.prospectEmail,
      prospectName: winBackEnrollments.prospectName,
      exitedAt: winBackEnrollments.exitedAt,
    })
    .from(winBackEnrollments)
    .where(
      and(
        eq(winBackEnrollments.engagementId, engagementId),
        eq(winBackEnrollments.status, "rebooked"),
        gte(winBackEnrollments.exitedAt, sinceDate)
      )
    );

  const recoveredEnrollments: RecoveredEnrollmentSummary[] = recovered.map((r) => ({
    prospectEmail: r.prospectEmail,
    prospectName: r.prospectName,
    rebookedAt: (r.exitedAt ?? new Date()).toISOString(),
  }));

  const recoveredCount = recoveredEnrollments.length;
  const totalRevenue = recoveredCount * offerPrice;

  return {
    engagementId,
    periodLabel: quarterLabel(sinceDate),
    sinceIso: sinceDate.toISOString(),
    offerPrice,
    recoveredCount,
    totalRevenue,
    averageRecoveryValue: recoveredCount > 0 ? totalRevenue / recoveredCount : 0,
    recoveredEnrollments,
  };
}
