import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { confirmClientFact, editClientFact, getClientFact, rejectClientFact } from "@/lib/client-facts";
import { applyResolvableFacts } from "@/lib/field-writeback";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * A human's decision on one suggested client fact, from a dossier's
 * suggestion chip:
 *   - confirm: "use this" — the suggestion becomes a trusted answer.
 *   - edit:    "use this, but changed" — stores the human's value.
 *   - reject:  "not right" — kept as rejected so the same value isn't
 *              suggested again (see upsertClientFact).
 * Confirm and edit then run the writeback so the value reaches config
 * right away where a field is still empty.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; key: string }> }) {
  try {
    const { id, key } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [owned] = await db
      .select({ id: engagements.id })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, id),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);
    if (!owned) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const action = body?.action;
    if (action !== "confirm" && action !== "edit" && action !== "reject") {
      return NextResponse.json({ error: "action must be confirm, edit, or reject." }, { status: 400 });
    }

    if (action === "edit") {
      if (!("value" in (body ?? {})) || body.value === undefined || body.value === null) {
        return NextResponse.json({ error: "edit needs a value." }, { status: 400 });
      }
      await editClientFact(id, key, body.value);
    } else {
      const fact = await getClientFact(id, key);
      if (!fact) {
        return NextResponse.json({ error: "No suggestion on file for this field." }, { status: 404 });
      }
      if (action === "confirm") await confirmClientFact(id, key);
      else await rejectClientFact(id, key);
    }

    if (action !== "reject") {
      await applyResolvableFacts(id).catch((err) => console.error(`[facts/${key}] writeback after ${action} failed for ${id}:`, err));
    }

    return NextResponse.json({ ok: true, key, action });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/facts/[key]]", message);
    return NextResponse.json({ error: "Failed to record the decision." }, { status: 500 });
  }
}
