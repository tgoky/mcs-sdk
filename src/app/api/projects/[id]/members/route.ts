import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { projects, projectEngagements, engagements } from "@/models/schema";
import { and, eq, isNull } from "drizzle-orm";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { SKILL_IDS, type SkillId } from "@/lib/skill-manifest";
import crypto from "crypto";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const body = await req.json().catch(() => null);
  const engagementId = typeof body?.engagementId === "string" ? body.engagementId : "";
  if (!engagementId) {
    return NextResponse.json({ error: "engagementId is required" }, { status: 400 });
  }

  const [project] = await db
    .select({ id: projects.id, enabledSkills: projects.enabledSkills })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.whopUserId, session.whopUserId), isNull(projects.deletedAt)))
    .limit(1);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [engagement] = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, engagementId),
        eq(engagements.whopUserId, session.whopUserId),
        isNull(engagements.deletedAt)
      )
    )
    .limit(1);

  if (!engagement) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  await db
    .insert(projectEngagements)
    .values({ id: crypto.randomUUID(), projectId, engagementId })
    .onConflictDoNothing();

  const enabledSkills = (project.enabledSkills ?? []) as SkillId[];
  await Promise.all(
    SKILL_IDS.map((skillId) => setSkillEnabledForEngagement(engagementId, skillId, enabledSkills.includes(skillId)))
  );

  return NextResponse.json({ ok: true });
}
