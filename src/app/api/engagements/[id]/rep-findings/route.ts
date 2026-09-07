// src/app/api/engagements/[id]/rep-findings/route.ts
//
// The per-engagement RM findings page's data source — the missing piece
// flagged this session: RM's ingestion tables (rep_engine_findings,
// rep_trustpilot_reviews, rep_reddit_mentions, rep_twitter_mentions,
// rep_incidents) previously had no route scoping them to one client. The
// only existing readers were the run-detail page (one run's own
// time-window slice) and the two workspace-wide reputation-manager/ pages
// — nothing showed one client's actual history in one place.
//
// Read-only, most-recent-N per table (LIMIT, not a time window) — this is
// meant to answer "what does this client's reputation actually look like
// right now," not reconstruct a specific run's slice the way the
// run-detail route's window-scoped queries do.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, repEngineFindings, repTrustpilotReviews, repRedditMentions, repTwitterMentions, repIncidents } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq, desc } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

const ROW_LIMIT = 50;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [tenant] = await db
      .select({ engagementId: engagements.engagementId })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, engagementId),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);
    if (!tenant) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }

    const [engineFindings, trustpilotReviews, redditMentions, twitterMentions, incidents] = await Promise.all([
      db.select().from(repEngineFindings).where(eq(repEngineFindings.engagementId, engagementId)).orderBy(desc(repEngineFindings.runAt)).limit(ROW_LIMIT),
      db.select().from(repTrustpilotReviews).where(eq(repTrustpilotReviews.engagementId, engagementId)).orderBy(desc(repTrustpilotReviews.createdAt)).limit(ROW_LIMIT),
      db.select().from(repRedditMentions).where(eq(repRedditMentions.engagementId, engagementId)).orderBy(desc(repRedditMentions.createdAt)).limit(ROW_LIMIT),
      db.select().from(repTwitterMentions).where(eq(repTwitterMentions.engagementId, engagementId)).orderBy(desc(repTwitterMentions.createdAt)).limit(ROW_LIMIT),
      db.select().from(repIncidents).where(eq(repIncidents.engagementId, engagementId)).orderBy(desc(repIncidents.declaredAt)).limit(ROW_LIMIT),
    ]);

    return NextResponse.json({ engineFindings, trustpilotReviews, redditMentions, twitterMentions, incidents });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
