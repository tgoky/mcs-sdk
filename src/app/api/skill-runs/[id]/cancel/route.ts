import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { skillRuns, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { inngest, skillRunCancel } from "@/lib/inngest";
import { cancelRun } from "@/lib/run-log";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [row] = await db
      .select({ id: skillRuns.id, status: skillRuns.status })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(eq(skillRuns.id, id), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (row.status !== "running") {
      return NextResponse.json(
        { error: `Run is already ${row.status}, nothing to cancel.` },
        { status: 409 }
      );
    }

    await cancelRun(id);
    
    // Fixed type constraint violation cleanly using Inngest v4 payload creators
    await inngest.send(skillRunCancel.create({ runId: id }));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[skill-runs/[id]/cancel]", err);
    return NextResponse.json({ error: "Failed to cancel run." }, { status: 500 });
  }
}