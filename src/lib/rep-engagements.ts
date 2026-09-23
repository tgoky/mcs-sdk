import { db } from "@/lib/db";
import { engagements, repIdentityGraphs } from "@/models/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

/**
 * "Identity Setup has actually been completed" — not just "a
 * rep_identity_graphs row exists". The rep-onboarding bridge route inserts
 * a placeholder row (operatorName "", soleAuthorityName "") the moment its
 * form is merely opened, so row existence alone would arm every scheduled
 * Reputation Manager watch against a blank name (e.g. rep-twitter-watch
 * sending `query=` and failing with a 400). Every cron, the Library's
 * enabled evidence, and the pre-run config gate use this instead.
 */
export const repIdentityIsComplete = and(
  sql`trim(${repIdentityGraphs.operatorName}) <> ''`,
  sql`trim(${repIdentityGraphs.soleAuthorityName}) <> ''`
)!;

/**
 * Engagement IDs in this workspace enrolled in Reputation Manager — same
 * "has a rep_identity_graphs row" signal /dashboard/engagements/page.tsx
 * and /dashboard/reputation-manager/page.tsx already use, centralized here
 * now that the RM dashboard, Incidents, and Analytics pages all need the
 * same scoped id list to filter their own tables (rep_incidents,
 * rep_engine_findings, ...) down to "this workspace's clients" rather than
 * every engagement across every tenant.
 */
export async function getRepEnrolledEngagementIds(whopUserId: string, workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .innerJoin(repIdentityGraphs, eq(repIdentityGraphs.engagementId, engagements.engagementId))
    .where(
      and(
        eq(engagements.whopUserId, whopUserId),
        eq(engagements.workspaceId, workspaceId),
        isNull(engagements.deletedAt)
      )
    );

  return rows.map((r) => r.engagementId);
}
