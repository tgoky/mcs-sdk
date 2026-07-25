import { db } from "@/lib/db";
import { engagementSkills } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import type { SkillId } from "@/lib/skill-registry";

/**
 * No row for (engagementId, skillId) means enabled — this table only ever
 * needs to hold explicit disables, so every engagement that predates the
 * Skill Library concept reads as "all skills on" with zero migration
 * needed on their data.
 */
export async function isSkillEnabledForEngagement(engagementId: string, skillId: SkillId): Promise<boolean> {
  const [row] = await db
    .select({ enabled: engagementSkills.enabled })
    .from(engagementSkills)
    .where(and(eq(engagementSkills.engagementId, engagementId), eq(engagementSkills.skillId, skillId)))
    .limit(1);

  return row ? row.enabled : true;
}

/**
 * Upserts the enabled flag for one (engagementId, skillId) pair. Used by
 * the future Skill Library toggle UI — not called anywhere in the app yet.
 */
export async function setSkillEnabledForEngagement(
  engagementId: string,
  skillId: SkillId,
  enabled: boolean
): Promise<void> {
  await db
    .insert(engagementSkills)
    .values({ engagementId, skillId, enabled })
    .onConflictDoUpdate({
      target: [engagementSkills.engagementId, engagementSkills.skillId],
      set: { enabled, updatedAt: new Date() },
    });
}
