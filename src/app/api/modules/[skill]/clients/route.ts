import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isSkillId } from "@/lib/skill-manifest";
import { getActiveWorkspace } from "@/lib/workspace";
import { getSkillActiveClients } from "@/lib/module-overview";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Backs the Engagements secondary sidebar's "other clients on this skill"
 * section (recent-engagements-section.tsx) — GET
 * /api/modules/pre-call-read/clients?exclude=eng_x returns every other
 * client with pre-call-read active, so jumping between clients from inside
 * a skill page stays scoped to that skill instead of falling back to the
 * generic most-recently-created client list.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ skill: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { skill: rawSkill } = await params;
    if (!rawSkill || !isSkillId(rawSkill)) {
      return NextResponse.json({ error: "Unknown skill." }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const exclude = searchParams.get("exclude") ?? undefined;

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const clients = await getSkillActiveClients(session.whopUserId, activeWorkspace.workspaceId, rawSkill, exclude);

    return NextResponse.json({ clients });
  } catch (err) {
    console.error("[api/modules/[skill]/clients]", err);
    return NextResponse.json({ error: "Failed to load clients." }, { status: 500 });
  }
}
