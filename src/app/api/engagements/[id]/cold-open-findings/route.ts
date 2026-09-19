// src/app/api/engagements/[id]/cold-open-findings/route.ts
//
// Cold Open's per-engagement findings page data source — same shape as
// rep-findings/route.ts (that file's own header explains the pattern):
// read-only, most-recent-N per table, answering "what has this client's
// Cold Open pipeline actually done" in one call instead of reconstructing
// it from individual skillRuns rows.
//
// Cold Open never had this at all before — every one of its 7 skills fell
// through to the bare engagement page's Run History, with no view of the
// leads it actually pushed or the replies it actually classified.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, coldOpenConfig, coldOpenLeads, coldOpenReplies } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq, desc, gte, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

const ROW_LIMIT = 200;
// Same rolling window features/cold-open/server/send-report.ts rolls up
// into a run log every scheduled pass — mirrored here as a real grouped
// query (not derived from the possibly-truncated ROW_LIMIT lists above,
// which can miss rows once a client has more than 200 recent leads) so
// the page's "last 7 days" strip reports the same numbers Send Report
// itself would, not an approximation. Phase 6 — this used to be its own
// separate hardcoded `const REPORT_WINDOW_DAYS = 7`, silently divergeable
// from send-report.ts's own copy of the same constant. Now both read the
// same coldOpenConfig.reportWindowDays column (schema.ts) — see the
// config fetch below, which happens before `since` is computed for
// exactly this reason.
const DEFAULT_REPORT_WINDOW_DAYS = 7;

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

    const config = await db.select().from(coldOpenConfig).where(eq(coldOpenConfig.engagementId, engagementId)).limit(1);
    const reportWindowDays = config[0]?.reportWindowDays ?? DEFAULT_REPORT_WINDOW_DAYS;
    const since = new Date(Date.now() - reportWindowDays * 24 * 60 * 60 * 1000);

    const [leads, replies, leadRows7d, replyRows7d] = await Promise.all([
      db.select().from(coldOpenLeads).where(eq(coldOpenLeads.engagementId, engagementId)).orderBy(desc(coldOpenLeads.createdAt)).limit(ROW_LIMIT),
      db.select().from(coldOpenReplies).where(eq(coldOpenReplies.engagementId, engagementId)).orderBy(desc(coldOpenReplies.classifiedAt)).limit(ROW_LIMIT),
      db
        .select({ status: coldOpenLeads.status, count: sql<number>`count(*)::int` })
        .from(coldOpenLeads)
        .where(and(eq(coldOpenLeads.engagementId, engagementId), gte(coldOpenLeads.createdAt, since)))
        .groupBy(coldOpenLeads.status),
      db
        .select({ disposition: coldOpenReplies.disposition, count: sql<number>`count(*)::int` })
        .from(coldOpenReplies)
        .where(and(eq(coldOpenReplies.engagementId, engagementId), gte(coldOpenReplies.classifiedAt, since)))
        .groupBy(coldOpenReplies.disposition),
    ]);

    const last7Days = {
      leadsByStatus: Object.fromEntries(leadRows7d.map((r) => [r.status, r.count])) as Record<string, number>,
      repliesByDisposition: Object.fromEntries(replyRows7d.map((r) => [r.disposition, r.count])) as Record<string, number>,
    };

    return NextResponse.json({ config: config[0] ?? null, leads, replies, last7Days });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
