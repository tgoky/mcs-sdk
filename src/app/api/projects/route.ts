import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { projects, projectEngagements, engagements } from "@/models/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { SKILL_IDS, type SkillId } from "@/lib/skill-manifest";
import crypto from "crypto";

export async function GET() {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.whopUserId, session.whopUserId), isNull(projects.deletedAt)))
    .orderBy(desc(projects.createdAt));

  return NextResponse.json({ projects: rows });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const enabledSkills: SkillId[] = Array.isArray(body?.enabledSkills)
    ? body.enabledSkills.filter((s: unknown): s is SkillId => SKILL_IDS.includes(s as SkillId))
    : [];
  const engagementIds: string[] = Array.isArray(body?.engagementIds)
    ? body.engagementIds.filter((id: unknown) => typeof id === "string")
    : [];
  const description = typeof body?.description === "string" ? body.description.trim() || null : null;

  const id = crypto.randomUUID();

  await db.insert(projects).values({
    id,
    whopUserId: session.whopUserId,
    name,
    description,
    enabledSkills,
  });

  if (engagementIds.length > 0) {
    // Only attach engagements that actually belong to this tenant.
    const ownedRows = await db
      .select({ engagementId: engagements.engagementId })
      .from(engagements)
      .where(and(eq(engagements.whopUserId, session.whopUserId), isNull(engagements.deletedAt)));
    const ownedIds = new Set(ownedRows.map((r) => r.engagementId));
    const validEngagementIds = engagementIds.filter((eid) => ownedIds.has(eid));

    await Promise.all(
      validEngagementIds.map(async (engagementId) => {
        await db.insert(projectEngagements).values({
          id: crypto.randomUUID(),
          projectId: id,
          engagementId,
        });
        // Cascade the project's skill policy onto this engagement — every
        // skill in enabledSkills gets explicitly turned on, everything
        // else explicitly off, reusing the same table/helper the
        // engagement detail page's own Skills panel already writes to.
        await Promise.all(
          SKILL_IDS.map((skillId) =>
            setSkillEnabledForEngagement(engagementId, skillId, enabledSkills.includes(skillId))
          )
        );
      })
    );
  }

  return NextResponse.json({ id, name, description, enabledSkills }, { status: 201 });
}
