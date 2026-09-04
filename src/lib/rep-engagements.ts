import { db } from "@/lib/db";
import { engagements, repIdentityGraphs } from "@/models/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

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
