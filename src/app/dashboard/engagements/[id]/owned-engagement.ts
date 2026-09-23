// src/app/dashboard/engagements/[id]/owned-engagement.ts
//
// The access check every client-scoped page under engagements/[id] does
// first: the engagement must belong to the signed-in user and sit in their
// active workspace. Returns null otherwise, so the page can notFound().

import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";

/** Just what the page shell needs; a page body that needs more (e.g.
 * Pin-Down's deliverables) loads it itself. */
export interface OwnedEngagement {
  engagementId: string;
  buyer: string;
  stack: EngagementStack | null;
}

export async function loadOwnedEngagement(engagementId: string): Promise<OwnedEngagement | null> {
  const session = await getSession();
  if (!session?.whopUserId) return null;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);
  const [engagement] = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, stack: engagements.stack })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, engagementId),
        eq(engagements.whopUserId, session.whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    )
    .limit(1);
  return engagement ? { ...engagement, stack: (engagement.stack as EngagementStack | null) ?? null } : null;
}
